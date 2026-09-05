import { PLAN_CAPABILITIES, type PlanKey, type PlanCapabilities } from './plans'

/**
 * The subscription-lifecycle vocabulary this module understands, aligned to
 * Paddle's current subscription status lifecycle (the leading billing-
 * provider candidate — the founder is based in Albania, where standard
 * Stripe availability is a problem; no provider has been selected yet).
 * This type has no import from and no dependency on Paddle or any billing
 * provider's SDK — it is webioom's own product-domain vocabulary, chosen to
 * need little to no translation once Phase 23.2 actually maps Paddle
 * webhook payloads onto it.
 */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'

/**
 * The exact shape read back from the `subscriptions` table (see the Phase
 * 23.1 migration). Intentionally untyped as `string` for `plan_key`/
 * `status` at this boundary — a row could in principle contain a value this
 * module doesn't recognize (a future/rolled-back migration, manual SQL, a
 * bug in a future webhook handler), and resolveEntitlements below is the
 * one place that treats an unrecognized value as a fail-closed condition
 * rather than a runtime type error.
 */
export type SubscriptionRecord = {
  plan_key: string
  status: string
  current_period_end: string | null
  trial_end: string | null
} | null

const KNOWN_PLAN_KEYS = new Set<string>(['free', 'bloom', 'bloom_pro'] satisfies PlanKey[])
const KNOWN_STATUSES = new Set<string>(['active', 'trialing', 'past_due', 'paused', 'canceled'] satisfies SubscriptionStatus[])
/**
 * Which known statuses currently grant the row's own plan. `past_due`
 * grants access FOR NOW — this is the current safe default, not a
 * finalized billing-lifecycle decision (see the module-level doc comment
 * on resolveEntitlements below and docs/entitlements.md). `paused` and
 * `canceled` never grant a plan.
 */
const ACTIVE_STATUSES = new Set<string>(['active', 'trialing', 'past_due'] satisfies SubscriptionStatus[])

function isKnownPlanKey(value: string): value is PlanKey {
  return KNOWN_PLAN_KEYS.has(value)
}

/**
 * The full set of entitlements a request can act on — always the result of
 * resolveEntitlements below, never constructed by hand anywhere else.
 * `subscriptionInactive` is `true` only when a real subscription row exists
 * whose status/plan_key could not grant the plan it named (a genuine lapse,
 * cancellation, or unrecognized value) — it is `false` for a user with no
 * row at all, since "never subscribed" and "subscription lapsed" are
 * different facts a UI (Phase 23.3) may want to say different things
 * about, and capabilities.ts uses this to choose between the
 * 'feature_not_in_plan' and 'subscription_inactive' failure reasons.
 */
export type PlanEntitlements = PlanCapabilities & {
  plan: PlanKey
  subscriptionInactive: boolean
}

function freeEntitlements(subscriptionInactive: boolean): PlanEntitlements {
  return { plan: 'free', subscriptionInactive, ...PLAN_CAPABILITIES.free }
}

/**
 * The single place plan + status + trial expiry are turned into concrete
 * entitlements. Pure and deterministic — no I/O, no Supabase import, so it
 * is fully testable with synthetic rows and never requires live Supabase
 * (see tests/entitlements.test.ts). `now` is a parameter (defaulting to the
 * real current time) purely so tests can exercise trial-expiry logic
 * without depending on wall-clock time.
 *
 * Fail-closed rules, in order:
 * 1. No row at all -> free, not "inactive" (the normal default state).
 * 2. An unrecognized status OR plan_key -> free, marked inactive. Never
 *    thrown, never upgraded — an unknown value is exactly as untrusted as
 *    an explicitly canceled one.
 * 3. `paused` or `canceled` -> free, marked inactive. Downgrade, not an
 *    error state a caller has to specially handle.
 * 4. `active`/`trialing`/`past_due` -> the row's own plan_key grants
 *    entitlements. `past_due` retaining access is the current SAFE
 *    DEFAULT, NOT a finalized billing-lifecycle decision: whether a
 *    past-due subscription should keep access only through
 *    `current_period_end` (a grace period) rather than indefinitely is
 *    explicitly deferred to Phase 23.2, once Paddle's actual webhook
 *    lifecycle is implemented — see docs/entitlements.md.
 *    `current_period_end` is already carried on SubscriptionRecord so that
 *    decision can be made later without a schema change.
 * 5. A 'trialing' row whose trial_end has already passed -> free, marked
 *    inactive. Defensive: covers the gap between a trial actually ending
 *    and a billing-provider webhook updating `status` to reflect it.
 */
export function resolveEntitlements(subscription: SubscriptionRecord, now: Date = new Date()): PlanEntitlements {
  if (!subscription) {
    return freeEntitlements(false)
  }

  if (!KNOWN_STATUSES.has(subscription.status) || !isKnownPlanKey(subscription.plan_key)) {
    return freeEntitlements(true)
  }

  if (!ACTIVE_STATUSES.has(subscription.status)) {
    return freeEntitlements(true)
  }

  const trialLapsed = subscription.status === 'trialing' && !!subscription.trial_end && new Date(subscription.trial_end) < now

  if (trialLapsed) {
    return freeEntitlements(true)
  }

  const plan = subscription.plan_key as PlanKey
  return { plan, subscriptionInactive: false, ...PLAN_CAPABILITIES[plan] }
}
