import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { classifyNotification, type ClassifiedNotification } from './notification-copy'
import type { MeaningfulChangeReason } from './notification-rules'

/**
 * Sprint 3 (monitoring + notifications completion) — the read side of the
 * in-app Notification Center. `monitoring_events` already IS the correct,
 * deduplicated, owner-scoped notification record (see the
 * 20261128000000_monitoring_notifications.sql migration's own doc comment
 * on why no separate `notifications` table exists) — every read here goes
 * through the ordinary SESSION-scoped Supabase client and relies entirely
 * on the existing `monitoring_events_select_own` RLS policy, exactly like
 * every other owner-scoped read in this codebase (crawl_runs, findings,
 * etc.). No admin client, and no manual ownership filter, is ever used for
 * a read in this file — only WRITES (marking read; see
 * app/dashboard/notifications/actions.ts) need the admin client, because
 * `monitoring_events` grants `authenticated` select only, not update.
 */

export type NotificationRow = {
  id: string
  websiteId: string
  websiteName: string
  eventType: 'meaningful_change' | 'monitoring_scan_failed'
  createdAt: string
  readAt: string | null
  classified: ClassifiedNotification
}

type RawEventRow = {
  id: string
  website_id: string
  event_type: 'meaningful_change' | 'monitoring_scan_failed'
  reasons: MeaningfulChangeReason[] | null
  overall_health_previous: number | null
  overall_health_current: number | null
  overall_health_delta: number | null
  new_count: number
  resolved_count: number
  worsened_count: number
  improved_count: number
  failure_reason: string | null
  created_at: string
  read_at: string | null
}

const EVENT_COLUMNS =
  'id, website_id, event_type, reasons, overall_health_previous, overall_health_current, overall_health_delta, new_count, resolved_count, worsened_count, improved_count, failure_reason, created_at, read_at'

function classifyRawEvent(row: RawEventRow): ClassifiedNotification {
  return classifyNotification({
    eventType: row.event_type,
    reasons: row.reasons ?? [],
    overallHealthPrevious: row.overall_health_previous,
    overallHealthCurrent: row.overall_health_current,
    overallHealthDelta: row.overall_health_delta,
    newCount: row.new_count,
    resolvedCount: row.resolved_count,
    worsenedCount: row.worsened_count,
    improvedCount: row.improved_count,
    failureReason: row.failure_reason,
  })
}

function toNotificationRow(row: RawEventRow, websiteName: string): NotificationRow {
  return {
    id: row.id,
    websiteId: row.website_id,
    websiteName,
    eventType: row.event_type,
    createdAt: row.created_at,
    readAt: row.read_at,
    classified: classifyRawEvent(row),
  }
}

async function fetchEventsForCurrentUser(limit: number): Promise<RawEventRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('monitoring_events').select(EVENT_COLUMNS).order('created_at', { ascending: false }).limit(limit)
  if (error || !data) return []
  return data as unknown as RawEventRow[]
}

/**
 * No embedded/joined Supabase select is used here — this codebase has no
 * established precedent for that syntax anywhere else (every existing
 * multi-table read is two sequential plain selects), so this follows the
 * same convention rather than introducing an unverified new pattern.
 */
async function websiteNamesById(websiteIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(websiteIds))
  if (uniqueIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data } = await supabase.from('websites').select('id, name, url').in('id', uniqueIds)

  const map = new Map<string, string>()
  for (const site of data ?? []) {
    map.set(site.id, site.name || site.url)
  }
  return map
}

export async function listNotificationsForCurrentUser(limit = 50): Promise<NotificationRow[]> {
  const events = await fetchEventsForCurrentUser(limit)
  const names = await websiteNamesById(events.map((event) => event.website_id))
  return events.map((event) => toNotificationRow(event, names.get(event.website_id) ?? 'Your website'))
}

export async function countUnreadNotificationsForCurrentUser(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase.from('monitoring_events').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error || count === null) return 0
  return count
}

export type LatestWebsiteNotification = { classified: ClassifiedNotification; createdAt: string }

/**
 * Sprint 3 (monitoring + notifications completion) — Section 4's "last
 * meaningful change" fact, shown inline on THIS website's own Overview
 * page (next to MonitoringStatus) rather than only in the cross-website
 * Notification Center, so a customer looking at one website doesn't have
 * to leave it to answer "what did webioom last tell me about this site."
 * RLS-scoped exactly like every other read in this file — a website id
 * that isn't the current user's own simply returns no row.
 */
export async function latestNotificationForWebsite(websiteId: string): Promise<LatestWebsiteNotification | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monitoring_events')
    .select(EVENT_COLUMNS)
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const row = data as unknown as RawEventRow
  return { createdAt: row.created_at, classified: classifyRawEvent(row) }
}

/**
 * Powers the Notifications Center's plan-aware empty state (Section 17 of
 * this sprint's brief: never imply automatic monitoring is running for a
 * customer it genuinely isn't running for). Reads the REAL per-website
 * `monitoring_enabled` flag rather than inferring it from the plan's
 * cadence ceiling — a Bloom+ customer who hasn't turned monitoring on for
 * any website yet is just as "not actually monitored" as a Free customer.
 */
export async function currentUserHasActiveMonitoring(): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.from('website_monitoring_settings').select('id').eq('monitoring_enabled', true).limit(1)
  return (data?.length ?? 0) > 0
}
