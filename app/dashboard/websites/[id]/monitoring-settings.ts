'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canEnableMonitoring, canUseMonitoringCadence } from '@/lib/entitlements'
import type { MonitoringCadence } from '@/lib/entitlements/plans'
import type { EntitlementFailureReason } from '@/lib/entitlements/capabilities'
import { computeNextDueAt } from '@/lib/monitoring/cadence'

/**
 * Sprint 2, Prompt 1 — MONITORING FOUNDATION. The only place a customer's
 * own `website_monitoring_settings` row is ever read or written. Re-verifies
 * session + website ownership on every call, exactly like every other
 * ownership-checked action in this directory (see security-actions.ts's own
 * getOwnedWebsite) — never trusts a caller's earlier check.
 *
 * This module is deliberately thin: it manages the customer's own
 * PREFERENCE (enabled/disabled, cadence, notification preference). It never
 * computes `next_due_at` or writes `last_monitored_crawl_run_id` — those
 * columns exist only as the stable foundation a future scheduler will
 * compute into; nothing in this codebase runs a scheduled scan yet.
 */

async function getOwnedWebsite(websiteId: string): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: website, error } = await supabase.from('websites').select('id').eq('id', websiteId).eq('user_id', user.id).single()
  if (error || !website) return null
  return website
}

export type MonitoringSettings = {
  monitoringEnabled: boolean
  cadence: MonitoringCadence
  notificationPreference: 'none' | 'email'
  lastMonitoredCrawlRunId: string | null
  nextDueAt: string | null
  /** Sprint 2, Prompt 2 — the outcome of the most recent scheduled attempt, independent of lastMonitoredCrawlRunId (which only ever advances on genuine success). Null until the very first scheduled attempt runs. */
  lastRunStatus: 'success' | 'failed' | null
  lastRunAt: string | null
  lastRunError: string | null
}

/** A website with no row yet has never had monitoring touched — this is the honest, unconfigured default, never fabricated activity. */
const DEFAULT_MONITORING_SETTINGS: MonitoringSettings = {
  monitoringEnabled: false,
  cadence: 'none',
  notificationPreference: 'none',
  lastMonitoredCrawlRunId: null,
  nextDueAt: null,
  lastRunStatus: null,
  lastRunAt: null,
  lastRunError: null,
}

export async function getMonitoringSettings(websiteId: string): Promise<MonitoringSettings | null> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('website_monitoring_settings')
    .select('monitoring_enabled, cadence, notification_preference, last_monitored_crawl_run_id, next_due_at, last_run_status, last_run_at, last_run_error')
    .eq('website_id', website.id)
    .maybeSingle()

  if (!data) return DEFAULT_MONITORING_SETTINGS

  return {
    monitoringEnabled: data.monitoring_enabled,
    cadence: data.cadence as MonitoringCadence,
    notificationPreference: data.notification_preference as 'none' | 'email',
    lastMonitoredCrawlRunId: data.last_monitored_crawl_run_id,
    nextDueAt: data.next_due_at,
    lastRunStatus: data.last_run_status,
    lastRunAt: data.last_run_at,
    lastRunError: data.last_run_error,
  }
}

export type UpdateMonitoringSettingsResult = { ok: true } | { ok: false; error: string; reason?: EntitlementFailureReason }

/**
 * The single write path for a customer's own monitoring preference.
 * Re-checks entitlements on every call — never trusts a decision the UI
 * made on a previous render, since the plan can change between them.
 * Turning monitoring OFF is always allowed, exactly like every other
 * "reduce your own usage" action in this codebase; only turning it ON, or
 * choosing a specific cadence, is gated. Disabling always resets cadence to
 * 'none' so a row is never left `enabled: true, cadence: 'none'` beyond a
 * single write, matching the migration's own documented invariant.
 */
export async function updateMonitoringSettings(
  websiteId: string,
  input: { enabled: boolean; cadence: MonitoringCadence; notificationPreference?: 'none' | 'email' }
): Promise<UpdateMonitoringSettingsResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  if (input.enabled) {
    const enableCheck = await canEnableMonitoring()
    if (!enableCheck.allowed) {
      return { ok: false, error: 'Recurring monitoring is not included in your current plan.', reason: enableCheck.reason }
    }

    const cadenceCheck = await canUseMonitoringCadence(input.cadence)
    if (!cadenceCheck.allowed) {
      return { ok: false, error: 'That monitoring frequency is not included in your current plan.', reason: cadenceCheck.reason }
    }
  }

  // Sprint 2, Prompt 2: scheduling is now real, so enabling monitoring (or
  // changing its cadence while enabled) must establish/recompute a genuine
  // next_due_at here — never left null while monitoring_enabled is true,
  // and always null while it is false, so the scheduler's own due-query
  // (lib/monitoring/due-selection.ts) never has to guess which rows with a
  // stale next_due_at are actually still meant to run.
  const nextDueAt = input.enabled ? computeNextDueAt(input.cadence) : null

  const supabase = await createClient()
  const { error } = await supabase.from('website_monitoring_settings').upsert(
    {
      website_id: website.id,
      monitoring_enabled: input.enabled,
      cadence: input.enabled ? input.cadence : 'none',
      notification_preference: input.notificationPreference ?? 'none',
      next_due_at: nextDueAt,
    },
    { onConflict: 'website_id' }
  )

  if (error) return { ok: false, error: 'Could not save monitoring settings. Please try again.' }

  revalidatePath(`/dashboard/websites/${website.id}`)
  return { ok: true }
}
