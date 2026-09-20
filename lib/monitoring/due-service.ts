import 'server-only'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { selectDueCandidates, type MonitoringSettingsRow } from './due-selection'
import { staleClaimThreshold, MONITORING_STALE_CLAIM_MINUTES } from './claim'
import type { MonitoringCadence } from '@/lib/entitlements/plans'

/**
 * Sprint 2, Prompt 2 — STEP 3. The Supabase-coupled half of due-work
 * claiming — see due-selection.ts's own doc comment for the pure decision
 * logic this wraps, and lib/monitoring/claim.ts's own doc comment for the
 * exact concurrency guarantee every claim attempt below relies on. Uses
 * the service-role admin client throughout: this is a trusted,
 * server-to-server, no-user-session caller (the monitoring cron route),
 * exactly like lib/crawler/supabase-store.ts's own documented admin-client
 * usage — ownership is established by the fact that a row only becomes a
 * "due candidate" at all because ITS OWNER already turned monitoring on
 * for it (website_monitoring_settings' own RLS-protected, owner-only write
 * path — see the Prompt 1 migration), never by anything this module trusts
 * from a request.
 */

const CANDIDATE_FETCH_LIMIT = 50

export type ClaimedMonitoringWebsite = {
  websiteId: string
  websiteUrl: string
  userId: string
  cadence: MonitoringCadence
  notificationPreference: 'none' | 'email'
  lastMonitoredCrawlRunId: string | null
  claimToken: string
}

/**
 * Fetches up to CANDIDATE_FETCH_LIMIT enabled monitoring rows, classifies
 * them (selectDueCandidates), and attempts to atomically claim up to
 * `maxClaims` of them, in next_due_at order. A candidate this invocation
 * loses the claim race for (another invocation claimed it first, or its
 * state changed between the read and the claim attempt) is silently
 * skipped — never retried within the same call, since skipping it here
 * simply means it stays due for the NEXT scheduler tick, which is the
 * correct, safe outcome for a lost race.
 */
export async function fetchAndClaimDueWebsites(maxClaims: number): Promise<ClaimedMonitoringWebsite[]> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const staleIso = staleClaimThreshold(MONITORING_STALE_CLAIM_MINUTES)

  const { data: rows } = await admin
    .from('website_monitoring_settings')
    .select('website_id, monitoring_enabled, run_status, next_due_at, claimed_at')
    .eq('monitoring_enabled', true)
    .order('next_due_at', { ascending: true })
    .limit(CANDIDATE_FETCH_LIMIT)

  const settingsRows: MonitoringSettingsRow[] = (rows ?? []).map((r) => ({
    websiteId: r.website_id,
    monitoringEnabled: r.monitoring_enabled,
    runStatus: r.run_status,
    nextDueAt: r.next_due_at,
    claimedAt: r.claimed_at,
  }))

  const candidates = selectDueCandidates(settingsRows, nowIso, staleIso)
  const claimed: ClaimedMonitoringWebsite[] = []

  for (const candidate of candidates) {
    if (claimed.length >= maxClaims) break

    const claimToken = randomUUID()
    let query = admin
      .from('website_monitoring_settings')
      .update({ run_status: 'running', claimed_at: nowIso, claim_token: claimToken })
      .eq('website_id', candidate.websiteId)

    // Each branch's WHERE clause re-states the EXACT condition that made
    // this row a candidate in the first place — the atomic guard that
    // makes the claim safe under concurrent invocations (see claim.ts's
    // own doc comment for why this is sufficient without an explicit lock).
    query = candidate.claimKind === 'due' ? query.eq('run_status', 'idle').lte('next_due_at', nowIso) : query.eq('run_status', 'running').lt('claimed_at', staleIso)

    const { data: claimedRows } = await query.select('website_id, cadence, notification_preference, last_monitored_crawl_run_id')
    if (!claimedRows || claimedRows.length === 0) continue

    const claimedRow = claimedRows[0]

    const { data: website } = await admin.from('websites').select('id, url, user_id').eq('id', claimedRow.website_id).maybeSingle()
    if (!website) {
      // The website was deleted concurrently with this claim attempt —
      // release immediately rather than leaving a live claim pointed at
      // nothing; there is no scan to run for a website that no longer
      // exists.
      await admin.from('website_monitoring_settings').update({ run_status: 'idle', claim_token: null }).eq('website_id', candidate.websiteId).eq('claim_token', claimToken)
      continue
    }

    claimed.push({
      websiteId: website.id,
      websiteUrl: website.url,
      userId: website.user_id,
      cadence: claimedRow.cadence,
      notificationPreference: claimedRow.notification_preference,
      lastMonitoredCrawlRunId: claimedRow.last_monitored_crawl_run_id,
      claimToken,
    })
  }

  return claimed
}

export type MonitoringRunFinalization = {
  cadence?: MonitoringCadence
  monitoringEnabled?: boolean
  nextDueAt?: string | null
  lastMonitoredCrawlRunId?: string
  lastRunStatus?: 'success' | 'failed'
  lastRunAt?: string
  lastRunError?: string | null
}

/**
 * Releases a claim back to run_status = 'idle', guarded by `claim_token` so
 * a write from an invocation whose claim has since been superseded by a
 * stale-reclaim (see claim.ts) safely affects zero rows instead of
 * corrupting the new claimant's state. `patch` is applied on top of that
 * release — see monitoring-run.ts for how each outcome (success/failed/
 * still-in-progress/disabled-by-entitlement) builds its own patch.
 */
export async function finalizeMonitoringClaim(websiteId: string, claimToken: string, patch: MonitoringRunFinalization = {}): Promise<void> {
  const admin = createAdminClient()

  const update: Record<string, unknown> = { run_status: 'idle', claim_token: null }
  if (patch.cadence !== undefined) update.cadence = patch.cadence
  if (patch.monitoringEnabled !== undefined) update.monitoring_enabled = patch.monitoringEnabled
  if (patch.nextDueAt !== undefined) update.next_due_at = patch.nextDueAt
  if (patch.lastMonitoredCrawlRunId !== undefined) update.last_monitored_crawl_run_id = patch.lastMonitoredCrawlRunId
  if (patch.lastRunStatus !== undefined) update.last_run_status = patch.lastRunStatus
  if (patch.lastRunAt !== undefined) update.last_run_at = patch.lastRunAt
  if (patch.lastRunError !== undefined) update.last_run_error = patch.lastRunError

  await admin.from('website_monitoring_settings').update(update).eq('website_id', websiteId).eq('claim_token', claimToken)
}
