import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ChangeSummary } from './compare'
import { selectTopFindingsForEvent, type MeaningfulChangeReason } from './notification-rules'

/**
 * Sprint 2, Prompt 2 — STEP 8. The one place a monitoring_events row is
 * ever written. Service-role only, exactly like every other write this
 * sprint's monitoring pipeline makes — monitoring_events grants
 * `authenticated` select only (see the migration); there is no path for a
 * browser to create one directly.
 */

export type MonitoringEventRow = { id: string; websiteId: string; eventType: 'meaningful_change' | 'monitoring_scan_failed' }

const POSTGRES_UNIQUE_VIOLATION = '23505'

export type CreateMeaningfulChangeEventInput = {
  websiteId: string
  currentCrawlRunId: string
  previousCrawlRunId: string
  summary: ChangeSummary
  reasons: MeaningfulChangeReason[]
}

/**
 * IDEMPOTENT BY CONSTRUCTION: relies entirely on monitoring_events' own
 * `unique (website_id, current_crawl_run_id)` constraint. If this pipeline
 * step ever runs twice for the same newly-completed scan (a retry after a
 * crash between comparing and persisting, for example), the second
 * attempt's insert hits that constraint, is detected via Postgres's own
 * unique-violation error code, and the ALREADY-EXISTING row is fetched and
 * returned instead — never a second, duplicate event, and never a thrown
 * error for what is actually a safe, expected retry outcome.
 */
export async function createMeaningfulChangeEvent(input: CreateMeaningfulChangeEventInput): Promise<MonitoringEventRow> {
  const admin = createAdminClient()
  const topFindings = selectTopFindingsForEvent(input.summary.findingChanges)

  const { data, error } = await admin
    .from('monitoring_events')
    .insert({
      website_id: input.websiteId,
      event_type: 'meaningful_change',
      current_crawl_run_id: input.currentCrawlRunId,
      previous_crawl_run_id: input.previousCrawlRunId,
      reasons: input.reasons,
      overall_health_previous: input.summary.overallHealth.previousScore,
      overall_health_current: input.summary.overallHealth.currentScore,
      overall_health_delta: input.summary.overallHealth.delta,
      new_count: input.summary.counts.new,
      resolved_count: input.summary.counts.resolved,
      worsened_count: input.summary.counts.worsened,
      improved_count: input.summary.counts.improved,
      persistent_count: input.summary.counts.persistent,
      unverified_count: input.summary.counts.unverified,
      top_findings: topFindings,
    })
    .select('id, website_id, event_type')
    .single()

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      const existing = await findExistingEvent(input.websiteId, input.currentCrawlRunId)
      if (existing) return existing
    }
    throw new Error(`Could not create monitoring event: ${error.message}`)
  }

  return { id: data.id, websiteId: data.website_id, eventType: data.event_type }
}

/**
 * Same idempotency reasoning as createMeaningfulChangeEvent. `currentCrawlRunId`
 * may be null in the rare case the monitoring pipeline failed before any
 * crawl_run could even be created — the unique constraint provides no
 * duplicate protection in that specific edge case (Postgres never treats
 * two NULLs as equal for uniqueness), accepted as a low-stakes gap: at
 * worst one extra failure event/email for that narrow scenario, never a
 * false success.
 */
export async function createMonitoringScanFailedEvent(websiteId: string, currentCrawlRunId: string | null, sanitizedFailureReason: string): Promise<MonitoringEventRow | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('monitoring_events')
    .insert({
      website_id: websiteId,
      event_type: 'monitoring_scan_failed',
      current_crawl_run_id: currentCrawlRunId,
      failure_reason: sanitizedFailureReason,
    })
    .select('id, website_id, event_type')
    .single()

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION && currentCrawlRunId) {
      return await findExistingEvent(websiteId, currentCrawlRunId)
    }
    return null
  }

  return { id: data.id, websiteId: data.website_id, eventType: data.event_type }
}

async function findExistingEvent(websiteId: string, currentCrawlRunId: string): Promise<MonitoringEventRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('monitoring_events')
    .select('id, website_id, event_type')
    .eq('website_id', websiteId)
    .eq('current_crawl_run_id', currentCrawlRunId)
    .maybeSingle()

  return data ? { id: data.id, websiteId: data.website_id, eventType: data.event_type } : null
}
