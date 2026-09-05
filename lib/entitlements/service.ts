import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { resolveEntitlements, type SubscriptionRecord, type PlanEntitlements } from './subscription'
import {
  evaluateAddWebsite,
  evaluateManualScan,
  evaluateAiFix,
  evaluateDirectFix,
  evaluateAlerts,
  getMonitoringCadence as pureGetMonitoringCadence,
  type EntitlementCheckResult,
} from './capabilities'
import type { MonitoringCadence } from './plans'

/**
 * The ONLY place identity is established for entitlement purposes: always
 * the CURRENT session's own user, from auth.getUser() — no function in
 * this module accepts a userId parameter from its caller, so there is no
 * argument a careless or compromised caller could supply to read or act on
 * a different user's plan. The `subscriptions` table's own RLS policy
 * (auth.uid() = user_id, select-only — see the Phase 23.1 migration) is a
 * second, independent enforcement layer underneath this, not a substitute
 * for it.
 */
async function loadCurrentUserSubscription(): Promise<{ userId: string | null; subscription: SubscriptionRecord }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { userId: null, subscription: null }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_key, status, current_period_end, trial_end')
    .eq('user_id', user.id)
    .maybeSingle()
    .returns<SubscriptionRecord>()

  // A read error must never be treated as "this user has a paid plan" —
  // resolveEntitlements(null) is the least-privileged state, so failing
  // this way can never grant a capability by accident. It also can never
  // be confused with "no row exists," since both paths already resolve to
  // the exact same (correct) free entitlements.
  if (error) return { userId: user.id, subscription: null }

  return { userId: user.id, subscription: data }
}

/** The current session's resolved entitlements. Every other export in this module is built from this one call. */
export async function getCurrentUserEntitlements(): Promise<PlanEntitlements> {
  const { subscription } = await loadCurrentUserSubscription()
  return resolveEntitlements(subscription)
}

/**
 * Pre-insert check for addWebsite. Counts the current session's own
 * `websites` rows server-side (never trusts a count from the browser) and
 * compares against the resolved plan's `maxWebsites`.
 */
export async function canAddWebsite(): Promise<EntitlementCheckResult> {
  const supabase = await createClient()
  const { userId, subscription } = await loadCurrentUserSubscription()

  if (!userId) return { allowed: false, reason: 'not_authenticated' }

  const entitlements = resolveEntitlements(subscription)

  const { count, error } = await supabase.from('websites').select('id', { count: 'exact', head: true }).eq('user_id', userId)

  if (error) return { allowed: false, reason: 'not_authenticated' }

  return evaluateAddWebsite(entitlements, count ?? 0)
}

/**
 * Post-insert recheck for addWebsite, closing the race where two concurrent
 * requests both pass canAddWebsite's pre-insert check before either
 * commits. Counts AFTER the new row was inserted — the just-inserted row
 * is already included in `count`, so it is compared as `count - 1` against
 * evaluateAddWebsite's own `currentWebsiteCount >= maxWebsites` threshold,
 * exactly mirroring what the pre-insert check would have seen had it run
 * after the other request's insert instead of before it.
 *
 * Known limitation, accepted as the simplest correct mitigation without
 * introducing a database-level lock/serializable transaction for a V1,
 * low-contention scenario: if both concurrent requests genuinely race,
 * BOTH may independently observe the limit as exceeded and both self-
 * reject (the caller deletes its own just-inserted row on failure — see
 * addWebsite in app/dashboard/actions.ts). The failure mode is therefore
 * "occasionally has to retry once," never "silently exceeds the limit."
 */
export async function verifyWebsiteCountAfterInsert(): Promise<EntitlementCheckResult> {
  const supabase = await createClient()
  const { userId, subscription } = await loadCurrentUserSubscription()

  if (!userId) return { allowed: false, reason: 'not_authenticated' }

  const entitlements = resolveEntitlements(subscription)

  const { count, error } = await supabase.from('websites').select('id', { count: 'exact', head: true }).eq('user_id', userId)

  if (error) return { allowed: false, reason: 'not_authenticated' }

  return evaluateAddWebsite(entitlements, (count ?? 0) - 1)
}

/** Always `{ allowed: true }` today (both plans permit manual scans) — see plans.ts. Exists as the one call site Phase 24 will tighten. */
export async function canRunManualScan(): Promise<EntitlementCheckResult> {
  return evaluateManualScan(await getCurrentUserEntitlements())
}

/** Always `{ allowed: true }` today — not yet wired into any AI-fix call site (see docs/entitlements.md's Phase 23.1 scope note). */
export async function canUseAiFix(): Promise<EntitlementCheckResult> {
  return evaluateAiFix(await getCurrentUserEntitlements())
}

/** Always `{ allowed: true }` today — not yet wired into any direct-fix call site (see docs/entitlements.md's Phase 23.1 scope note). */
export async function canUseDirectFix(): Promise<EntitlementCheckResult> {
  return evaluateDirectFix(await getCurrentUserEntitlements())
}

/** Not yet consumed by any feature — alerts don't exist yet (Phase 24). */
export async function canReceiveAlerts(): Promise<EntitlementCheckResult> {
  return evaluateAlerts(await getCurrentUserEntitlements())
}

/** Not yet consumed by any feature — scheduling doesn't exist yet (Phase 24). */
export async function getCurrentUserMonitoringCadence(): Promise<MonitoringCadence> {
  return pureGetMonitoringCadence(await getCurrentUserEntitlements())
}
