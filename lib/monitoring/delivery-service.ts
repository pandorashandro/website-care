import 'server-only'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEmailProvider } from './email/provider'
import { renderMonitoringEmail, type RenderableMonitoringEvent } from './email/render'
import { sanitizeMonitoringError } from './errors'
import { staleClaimThreshold, DELIVERY_STALE_CLAIM_MINUTES, MAX_DELIVERY_ATTEMPTS } from './claim'

/**
 * Sprint 2, Prompt 2 — STEP 8. DELIVERY — "how/when was the customer
 * informed?" — deliberately independent of event-service.ts ("what
 * meaningful change occurred?"). A failed or retried delivery attempt
 * never mutates, duplicates, or erases the underlying monitoring_events
 * row; see the migration's own doc comment.
 */

/**
 * Creates the one delivery row for a newly-created event, IF the website
 * owner's own notification_preference is 'email' — when it is 'none', no
 * delivery row is created at all (the domain event still exists and is
 * visible in-app; the customer simply asked not to be emailed about it).
 * Idempotent via monitoring_deliveries' own unique(event_id, channel)
 * constraint, the same reasoning as event-service.ts's own idempotency.
 */
export async function createDeliveryForEvent(eventId: string, notificationPreference: 'none' | 'email'): Promise<void> {
  if (notificationPreference !== 'email') return

  const admin = createAdminClient()
  const { error } = await admin.from('monitoring_deliveries').insert({ event_id: eventId, channel: 'email' })

  // A unique-violation here means a delivery row for this event already
  // exists (a retried event-generation step) — nothing further to do,
  // never a second delivery row.
  if (error && error.code !== '23505') {
    console.error(`[monitoring] could not create delivery row for event ${eventId}:`, sanitizeMonitoringError(error))
  }
}

type CandidateDeliveryRow = { id: string; event_id: string; status: string; attempt_count: number }

/**
 * Three plain, separately-filtered queries merged and de-duplicated,
 * rather than one complex nested OR expression — deliberately, for
 * reviewability: each query's WHERE clause is trivial to verify by eye,
 * which matters more here than saving two round-trips for a background
 * retry pass that is not on any customer-facing latency path.
 */
async function fetchCandidateDeliveries(limit: number): Promise<CandidateDeliveryRow[]> {
  const admin = createAdminClient()
  const staleThreshold = staleClaimThreshold(DELIVERY_STALE_CLAIM_MINUTES)

  const [pending, failed, staleSending] = await Promise.all([
    admin.from('monitoring_deliveries').select('id, event_id, status, attempt_count').eq('status', 'pending').limit(limit),
    admin.from('monitoring_deliveries').select('id, event_id, status, attempt_count').eq('status', 'failed').lt('attempt_count', MAX_DELIVERY_ATTEMPTS).limit(limit),
    admin.from('monitoring_deliveries').select('id, event_id, status, attempt_count').eq('status', 'sending').lt('claimed_at', staleThreshold).limit(limit),
  ])

  const merged = [...(pending.data ?? []), ...(failed.data ?? []), ...(staleSending.data ?? [])]
  const seen = new Set<string>()
  const unique: CandidateDeliveryRow[] = []
  for (const row of merged) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    unique.push(row)
  }
  return unique.slice(0, limit)
}

type ClaimedDelivery = { deliveryId: string; eventId: string; claimToken: string }

/**
 * Atomic conditional claim — the same pattern as
 * lib/monitoring/due-service.ts's own website-run claim (see claim.ts's
 * doc comment for the exact concurrency guarantee): the WHERE clause
 * restates the row's exact state as read (`status` AND `attempt_count`
 * both), so a concurrent worker that already claimed this same row makes
 * this UPDATE affect zero rows instead of double-claiming it.
 * `attempt_count` is incremented here (read-then-conditionally-write,
 * never a blind `+1` update Supabase's query builder cannot express
 * atomically on its own) — the SAME conditional-match guarantee that
 * protects the claim itself also protects this increment from a lost
 * update.
 */
async function claimDelivery(row: CandidateDeliveryRow): Promise<ClaimedDelivery | null> {
  const admin = createAdminClient()
  const claimToken = randomUUID()

  const { data } = await admin
    .from('monitoring_deliveries')
    .update({ status: 'sending', claimed_at: new Date().toISOString(), claim_token: claimToken, attempt_count: row.attempt_count + 1 })
    .eq('id', row.id)
    .eq('status', row.status)
    .eq('attempt_count', row.attempt_count)
    .select('id')

  if (!data || data.length === 0) return null
  return { deliveryId: row.id, eventId: row.event_id, claimToken }
}

async function resolveRecipientEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) return null
  return data.user.email
}

async function loadEventForRendering(eventId: string): Promise<{ userId: string; event: RenderableMonitoringEvent } | null> {
  const admin = createAdminClient()

  const { data: eventRow } = await admin
    .from('monitoring_events')
    .select('website_id, event_type, overall_health_previous, overall_health_current, overall_health_delta, new_count, resolved_count, worsened_count, improved_count, top_findings, failure_reason')
    .eq('id', eventId)
    .maybeSingle()
  if (!eventRow) return null

  const { data: website } = await admin.from('websites').select('id, name, url, user_id').eq('id', eventRow.website_id).maybeSingle()
  if (!website) return null

  return {
    userId: website.user_id,
    event: {
      websiteId: website.id,
      websiteName: website.name || website.url,
      eventType: eventRow.event_type,
      overallHealthPrevious: eventRow.overall_health_previous,
      overallHealthCurrent: eventRow.overall_health_current,
      overallHealthDelta: eventRow.overall_health_delta,
      newCount: eventRow.new_count,
      resolvedCount: eventRow.resolved_count,
      worsenedCount: eventRow.worsened_count,
      improvedCount: eventRow.improved_count,
      topFindings: eventRow.top_findings ?? [],
      failureReason: eventRow.failure_reason,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    },
  }
}

async function attemptDelivery(deliveryId: string, eventId: string, claimToken: string): Promise<void> {
  const admin = createAdminClient()

  // Sprint 2, Prompt 4 production-vs-local audit: NEXT_PUBLIC_APP_URL was
  // never part of this sprint's own required-secrets checklist (only
  // RESEND_EMAIL_API_KEY/MONITORING_EMAIL_FROM_ADDRESS/CRON_SECRET were),
  // so a real deployment could easily go live without it set. Rather than
  // silently sending a customer a broken relative link
  // ("/dashboard/websites/..." with no host), an unconfigured base URL is
  // treated as an honest delivery failure — retried the same as any other
  // transient failure once the variable is actually set, never a
  // degraded-but-"successful" send.
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    await admin.from('monitoring_deliveries').update({ status: 'failed', last_error: 'NEXT_PUBLIC_APP_URL is not configured — refusing to send an email with a broken link.' }).eq('id', deliveryId).eq('claim_token', claimToken)
    return
  }

  const loaded = await loadEventForRendering(eventId)
  if (!loaded) {
    await admin.from('monitoring_deliveries').update({ status: 'failed', last_error: 'The underlying event or website no longer exists.' }).eq('id', deliveryId).eq('claim_token', claimToken)
    return
  }

  const recipientEmail = await resolveRecipientEmail(loaded.userId)
  if (!recipientEmail) {
    await admin.from('monitoring_deliveries').update({ status: 'failed', last_error: 'Could not resolve a recipient email address.' }).eq('id', deliveryId).eq('claim_token', claimToken)
    return
  }

  const { subject, text } = renderMonitoringEmail(loaded.event)
  const result = await getEmailProvider().send({ to: recipientEmail, subject, text })

  if (result.ok) {
    await admin
      .from('monitoring_deliveries')
      .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId ?? null })
      .eq('id', deliveryId)
      .eq('claim_token', claimToken)
  } else {
    await admin.from('monitoring_deliveries').update({ status: 'failed', last_error: sanitizeMonitoringError(result.error) }).eq('id', deliveryId).eq('claim_token', claimToken)
  }
}

/**
 * Claims and attempts up to `limit` outstanding deliveries (pending, or
 * failed-and-under-the-attempt-cap, or abandoned-mid-send) — called both
 * inline right after a new event's delivery row is created (the common,
 * zero-extra-latency case) and by a small dedicated retry pass, so a
 * transient provider failure is retried on a LATER invocation rather than
 * only ever getting one attempt.
 */
export async function processPendingDeliveries(limit = 20): Promise<{ attempted: number }> {
  const candidates = await fetchCandidateDeliveries(limit)
  let attempted = 0

  for (const candidate of candidates) {
    try {
      const claimed = await claimDelivery(candidate)
      if (!claimed) continue
      attempted++
      await attemptDelivery(claimed.deliveryId, claimed.eventId, claimed.claimToken)
    } catch {
      // Sprint 2, Prompt 3 reliability review: one delivery's unexpected
      // failure (a transient DB error mid-attempt, for example) must never
      // abort the rest of this batch — the caller (the monitoring cron
      // route, or a monitoring cycle's own inline retry pass) always needs
      // this function to return normally. An attempt left claimed
      // ('sending') by a failure here is recovered by the standard
      // stale-claim reclaim path, never left stuck forever.
    }
  }

  return { attempted }
}
