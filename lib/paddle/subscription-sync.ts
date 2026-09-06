import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaddlePriceMapping } from './config'
import { mapPaddleSubscriptionEvent, reconcileSubscriptionSnapshot, type PaddleSubscriptionEventData } from './event-mapping'
import { fetchPaddleSubscription } from './client'

export type ApplyPaddleSubscriptionEventResult =
  | 'applied'
  | 'stale'
  | 'duplicate'
  | 'reconciled'
  | 'reconciliation_failed'
  | 'skipped_unmapped'
  | 'failed'

/**
 * Applies one verified, parsed Paddle subscription webhook event to
 * webioom's `subscriptions` table via the `apply_paddle_subscription_event`
 * Postgres function (see the Phase 23.2 migration), which handles
 * event_id deduplication and occurred_at ordering atomically, inside one
 * advisory-locked transaction, entirely on the database side. Uses the
 * admin (service-role) client — exactly like the Shopify/Wix webhook
 * routes — because a webhook is a server-to-server delivery from Paddle
 * with no webioom user session at all.
 *
 * Duplicate/out-of-order safety and the equal-occurred_at reconciliation
 * path are both implemented in the database function this calls, not
 * here — see docs/paddle-billing.md's "Idempotency, ordering, and
 * reconciliation" section. This function's only added responsibility
 * beyond calling that RPC is: on an `'equal_conflict'` result, fetch
 * Paddle's own authoritative current subscription state and apply THAT
 * via `reconcilePaddleSubscription` below, rather than ever guessing which
 * of two identically-timestamped events should win.
 */
export async function applyPaddleSubscriptionEvent(
  data: PaddleSubscriptionEventData,
  occurredAt: string,
  eventId: string,
  eventType: string
): Promise<ApplyPaddleSubscriptionEventResult> {
  const mapped = mapPaddleSubscriptionEvent(data, getPaddlePriceMapping())
  if (!mapped.ok) return 'skipped_unmapped'

  const admin = createAdminClient()

  const { data: outcome, error } = await admin.rpc('apply_paddle_subscription_event', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_event_occurred_at: occurredAt,
    p_user_id: mapped.userId,
    p_plan_key: mapped.update.planKey,
    p_status: mapped.update.status,
    p_billing_provider: 'paddle',
    p_provider_customer_id: mapped.update.providerCustomerId,
    p_provider_subscription_id: mapped.update.providerSubscriptionId,
    p_current_period_end: mapped.update.currentPeriodEnd,
    p_trial_end: mapped.update.trialEnd,
  })

  if (error) return 'failed'

  if (outcome === 'equal_conflict') {
    const reconciled = await reconcilePaddleSubscription(mapped.userId, mapped.update.providerSubscriptionId)
    return reconciled ? 'reconciled' : 'reconciliation_failed'
  }

  // 'applied' | 'stale' | 'duplicate' | 'rejected' — 'rejected' can only
  // happen if this function's own call above passed a malformed value,
  // which mapPaddleSubscriptionEvent's own types already make impossible;
  // it is treated the same as any other non-equal_conflict outcome here
  // (returned as-is) rather than specially handled, since there is
  // nothing more for this layer to do about it.
  return outcome as ApplyPaddleSubscriptionEventResult
}

/**
 * Resolves the one ambiguity Paddle's own documentation does not: two
 * DISTINCT events for the same user sharing an identical `occurred_at`.
 * Rather than inventing an event-id ordering rule Paddle does not
 * document, this fetches Paddle's own CURRENT, authoritative subscription
 * state (`GET /subscriptions/{id}`) and applies that instead — a live
 * fetch is definitionally more trustworthy than guessing between two
 * conflicting webhook payloads.
 *
 * `expectedUserId` (the user id already trusted from the ORIGINAL
 * conflicting webhook event, itself only ever derived from
 * signature-verified `custom_data` — see event-mapping.ts) is
 * cross-checked against the freshly-fetched subscription's OWN
 * `custom_data.webioom_user_id`. A mismatch (or a fetched subscription
 * with no custom_data at all) fails the reconciliation closed rather than
 * applying a snapshot for what might be the wrong user — this is the
 * "authoritative reconciliation cannot trust [a single, uncorroborated]
 * input" guarantee: Paddle's API response is itself independently
 * re-validated, never blindly trusted just because it came back
 * successfully for the subscription id we asked for.
 */
export async function reconcilePaddleSubscription(expectedUserId: string, providerSubscriptionId: string): Promise<boolean> {
  const fetched = await fetchPaddleSubscription(providerSubscriptionId)
  if (!fetched.ok) return false

  const snapshot = reconcileSubscriptionSnapshot(fetched.data, expectedUserId, getPaddlePriceMapping())
  if (!snapshot.ok) return false

  const admin = createAdminClient()

  const { data: applied, error } = await admin.rpc('apply_paddle_subscription_reconciliation', {
    p_user_id: expectedUserId,
    p_plan_key: snapshot.update.planKey,
    p_status: snapshot.update.status,
    p_billing_provider: 'paddle',
    p_provider_customer_id: snapshot.update.providerCustomerId,
    p_provider_subscription_id: snapshot.update.providerSubscriptionId,
    p_current_period_end: snapshot.update.currentPeriodEnd,
    p_trial_end: snapshot.update.trialEnd,
  })

  if (error) return false

  return applied === true
}
