import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEntitlements, type PlanEntitlements } from './subscription'

/**
 * Sprint 2, Prompt 2 — the ONE service-role counterpart to
 * lib/entitlements/service.ts's getCurrentUserEntitlements, for the one
 * class of caller that has no user session to read at all: the scheduled-
 * monitoring pipeline (lib/monitoring/monitoring-run.ts), triggered by a
 * server-to-server cron request rather than a logged-in browser request
 * (exactly the same "no cookies" situation lib/supabase/admin.ts's own doc
 * comment already describes for the Shopify OAuth callback/webhook).
 *
 * `userId` is never accepted from client input here or anywhere upstream
 * of it — the monitoring pipeline's own due-work claim resolves it from
 * `websites.user_id` via the service-role admin client (see
 * lib/monitoring/due-service.ts), which is at least as strong a guarantee
 * of "this is the right user" as a cookie-bound session would be, since it
 * can only ever be the OWNER of a website that owner has already enabled
 * monitoring for.
 *
 * Uses the exact same `resolveEntitlements` every session-based path uses
 * — there is no second entitlement-resolution algorithm for this caller,
 * only a different (service-role, not cookie-based) way of finding the
 * subscription row to resolve.
 */
export async function getEntitlementsForUserId(userId: string): Promise<PlanEntitlements> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('subscriptions')
    .select('plan_key, status, current_period_end, trial_end')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return resolveEntitlements(null)

  return resolveEntitlements(data)
}
