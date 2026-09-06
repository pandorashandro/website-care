import type { PlanKey } from '@/lib/entitlements/plans'
import type { SubscriptionStatus } from '@/lib/entitlements/subscription'
import { derivePlanFromPriceId, type PaddlePriceMapping } from './plan-mapping'

/**
 * The exact, narrow shape this module reads out of a Paddle subscription
 * webhook's `data` object — never the full untyped payload. Confirmed
 * against developer.paddle.com's subscription webhook and entity
 * documentation: `status` is one of Paddle's own five subscription
 * statuses (which happen to already match webioom's SubscriptionStatus
 * vocabulary exactly — see mapPaddleStatus below, which still validates
 * rather than blindly trusting that coincidence), `items[].price.id` is
 * the subscribed price, `items[].trial_dates.ends_at` is the per-item
 * trial end (only present during/immediately after a trial),
 * `current_billing_period.ends_at` is the current period's end regardless
 * of whether that period is a trial or a paid cycle, and `custom_data` is
 * the merchant-defined data set at checkout time (see checkout backend —
 * this is where webioom's own trusted user id travels through Paddle and
 * back).
 */
export type PaddleSubscriptionEventData = {
  id: string
  customer_id: string
  status: string
  items: Array<{
    price?: { id?: string } | null
    trial_dates?: { ends_at?: string | null } | null
  }>
  current_billing_period: { ends_at?: string | null } | null
  custom_data: Record<string, unknown> | null
}

/**
 * Safely narrows an unknown, already-JSON-parsed value (the webhook's
 * `data` field) into PaddleSubscriptionEventData, or returns null if it
 * doesn't have the shape this module needs — never throws, never guesses
 * a missing field. Deliberately permissive about what it accepts (extra
 * fields are ignored) but strict about what it requires (id, customer_id,
 * status, and a well-formed items array must all be present as the
 * expected types).
 */
export function parsePaddleSubscriptionEventData(raw: unknown): PaddleSubscriptionEventData | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const id = obj.id
  const customerId = obj.customer_id
  const status = obj.status
  const items = obj.items

  if (typeof id !== 'string' || typeof customerId !== 'string' || typeof status !== 'string' || !Array.isArray(items)) {
    return null
  }

  const parsedItems: PaddleSubscriptionEventData['items'] = items.map((item) => {
    if (!item || typeof item !== 'object') return {}
    const itemObj = item as Record<string, unknown>

    const price = itemObj.price
    const priceId = price && typeof price === 'object' ? (price as Record<string, unknown>).id : undefined

    const trialDates = itemObj.trial_dates
    const trialEndsAt =
      trialDates && typeof trialDates === 'object' ? (trialDates as Record<string, unknown>).ends_at : undefined

    return {
      price: typeof priceId === 'string' ? { id: priceId } : null,
      trial_dates: typeof trialEndsAt === 'string' ? { ends_at: trialEndsAt } : null,
    }
  })

  const currentBillingPeriod = obj.current_billing_period
  const endsAt =
    currentBillingPeriod && typeof currentBillingPeriod === 'object'
      ? (currentBillingPeriod as Record<string, unknown>).ends_at
      : undefined

  const customData = obj.custom_data

  return {
    id,
    customer_id: customerId,
    status,
    items: parsedItems,
    current_billing_period: typeof endsAt === 'string' ? { ends_at: endsAt } : null,
    custom_data: customData && typeof customData === 'object' ? (customData as Record<string, unknown>) : null,
  }
}

/**
 * Paddle's raw subscription statuses happen to already match webioom's own
 * SubscriptionStatus vocabulary exactly (active/trialing/past_due/paused/
 * canceled — the product decision to align webioom's status vocabulary to
 * Paddle's was made specifically for this reason). This function still
 * validates explicitly rather than blindly casting the raw string — an
 * unrecognized status (a future Paddle status webioom doesn't know about
 * yet) fails closed to `null`, never silently passed through.
 */
export function mapPaddleStatus(rawStatus: string): SubscriptionStatus | null {
  switch (rawStatus) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'paused':
    case 'canceled':
      return rawStatus
    default:
      return null
  }
}

export type MappedPaddleSubscriptionUpdate = {
  planKey: PlanKey
  status: SubscriptionStatus
  providerCustomerId: string
  providerSubscriptionId: string
  currentPeriodEnd: string | null
  trialEnd: string | null
}

export type MapPaddleSubscriptionEventResult =
  | { ok: true; userId: string; update: MappedPaddleSubscriptionUpdate }
  | { ok: false; reason: 'missing_user_id' | 'unknown_status' | 'unknown_price' }

/**
 * The single place a verified Paddle subscription webhook's data is turned
 * into a trusted webioom subscription-state update. Every rule here is
 * fail-closed: a missing/non-string `custom_data.webioom_user_id` means
 * this event can never be attributed to a webioom user (see the checkout
 * backend, which is the only place this key is ever set — never
 * client-suppliable, since custom_data is set server-side when the
 * transaction is created); an unrecognized status is never passed through;
 * and — per this phase's explicit instruction — the plan is NEVER read
 * from any label Paddle's payload might carry, only derived from the
 * subscribed price ID via derivePlanFromPriceId's trusted, server-
 * configured mapping. An unrecognized price ID grants no paid plan at all,
 * it does not fall back to Bloom or any other plan.
 */
export function mapPaddleSubscriptionEvent(
  data: PaddleSubscriptionEventData,
  priceMapping: PaddlePriceMapping
): MapPaddleSubscriptionEventResult {
  const userId = typeof data.custom_data?.webioom_user_id === 'string' ? data.custom_data.webioom_user_id : null
  if (!userId) return { ok: false, reason: 'missing_user_id' }

  const status = mapPaddleStatus(data.status)
  if (!status) return { ok: false, reason: 'unknown_status' }

  const priceId = data.items[0]?.price?.id
  const plan = priceId ? derivePlanFromPriceId(priceId, priceMapping) : null
  if (!plan) return { ok: false, reason: 'unknown_price' }

  return {
    ok: true,
    userId,
    update: {
      planKey: plan,
      status,
      providerCustomerId: data.customer_id,
      providerSubscriptionId: data.id,
      currentPeriodEnd: data.current_billing_period?.ends_at ?? null,
      trialEnd: data.items[0]?.trial_dates?.ends_at ?? null,
    },
  }
}

export type ReconcileSnapshotResult =
  | { ok: true; update: MappedPaddleSubscriptionUpdate }
  | { ok: false; reason: 'malformed_response' | 'unmapped' | 'user_mismatch' }

/**
 * The pure decision core of the equal-occurred_at reconciliation path
 * (see subscription-sync.ts's reconcilePaddleSubscription, the only
 * caller). Given Paddle's raw `GET /subscriptions/{id}` response and the
 * user id already trusted from the ORIGINAL conflicting webhook event,
 * decides whether the freshly-fetched snapshot may be applied. Reuses
 * parsePaddleSubscriptionEventData/mapPaddleSubscriptionEvent exactly —
 * the GET response has the identical shape a webhook's `data` field does
 * — so status validation and price-based plan derivation are never
 * duplicated for this second entry point.
 *
 * Fails closed on `user_mismatch`: a successful API response for the
 * requested subscription id is not, by itself, sufficient proof this is
 * still the right user's subscription — the fetched snapshot's OWN
 * `custom_data.webioom_user_id` must independently match `expectedUserId`
 * (or the fetch is fully rejected) before its state is ever applied. This
 * is what keeps the reconciliation path from ever trusting a single,
 * uncorroborated data source.
 */
export function reconcileSubscriptionSnapshot(
  rawFetchedData: unknown,
  expectedUserId: string,
  priceMapping: PaddlePriceMapping
): ReconcileSnapshotResult {
  const parsed = parsePaddleSubscriptionEventData(rawFetchedData)
  if (!parsed) return { ok: false, reason: 'malformed_response' }

  const mapped = mapPaddleSubscriptionEvent(parsed, priceMapping)
  if (!mapped.ok) return { ok: false, reason: 'unmapped' }

  if (mapped.userId !== expectedUserId) return { ok: false, reason: 'user_mismatch' }

  return { ok: true, update: mapped.update }
}
