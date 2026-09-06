'use server'

import { createClient } from '@/lib/supabase/server'
import { getPaddlePriceMapping } from '@/lib/paddle/config'
import { resolvePaddlePriceId, isPaddlePlanKey } from '@/lib/paddle/plan-mapping'
import { createPaddleTransaction, createPaddleCustomerPortalSession } from '@/lib/paddle/client'

export type CreateCheckoutState =
  | { ok: true; transactionId: string; checkoutUrl: string | null }
  | { ok: false; reason: 'not_authenticated' | 'invalid_plan' | 'plan_not_configured' | 'provider_error' }
  | null

/**
 * The backend half of the future Phase 23.3 checkout UI. The browser may
 * only ever submit a webioom plan KEY ('bloom' | 'bloom_pro') — never a
 * Paddle price ID, customer ID, or subscription ID. This function is the
 * one place that resolves the trusted, server-configured price ID
 * (resolvePaddlePriceId) and attaches this session's own user id as
 * `custom_data.webioom_user_id` on the Paddle transaction it creates —
 * that custom_data is what event-mapping.ts's mapPaddleSubscriptionEvent
 * later reads back out of the resulting webhook, giving webioom a fully
 * server-to-server-trusted binding from a Paddle subscription back to
 * exactly one webioom user, with no step where a browser-supplied value is
 * ever treated as authoritative.
 *
 * Reuses this user's existing Paddle customer (if any) by reading THIS
 * session's own `subscriptions.provider_customer_id` — never a customer id
 * supplied by the browser — so a user upgrading/re-subscribing is bound to
 * the same Paddle customer record rather than accidentally creating a new
 * one every time.
 */
export async function createCheckoutForPlan(_prevState: CreateCheckoutState, formData: FormData): Promise<CreateCheckoutState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, reason: 'not_authenticated' }
  }

  const requestedPlan = formData.get('plan') as string | null
  if (!requestedPlan || !isPaddlePlanKey(requestedPlan)) {
    return { ok: false, reason: 'invalid_plan' }
  }

  const priceId = resolvePaddlePriceId(requestedPlan, getPaddlePriceMapping())
  if (!priceId) {
    return { ok: false, reason: 'plan_not_configured' }
  }

  const { data: existingSubscription } = await supabase
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const result = await createPaddleTransaction({
    priceId,
    customData: { webioom_user_id: user.id },
    customerId: existingSubscription?.provider_customer_id ?? undefined,
  })

  if (!result.ok) {
    return { ok: false, reason: 'provider_error' }
  }

  return { ok: true, transactionId: result.transactionId, checkoutUrl: result.checkoutUrl }
}

export type CreatePortalSessionState =
  | { ok: true; url: string }
  | { ok: false; reason: 'not_authenticated' | 'no_paid_customer' | 'provider_error' }
  | null

/**
 * The backend half of the future Phase 23.3 "manage billing" UI.
 * `customerId` is ALWAYS this session's own, previously-stored
 * `subscriptions.provider_customer_id` (set only by a verified Paddle
 * webhook — see subscription-sync.ts) — never accepted as an argument from
 * the browser, and this function accepts no such argument at all. A user
 * with no stored provider_customer_id (never subscribed, or a subscription
 * row that predates any successful webhook) fails closed with
 * `no_paid_customer` rather than guessing or creating one.
 *
 * Deliberately takes no arguments at all (not the `(prevState, formData)`
 * shape `createCheckoutForPlan` uses) — there is genuinely nothing for a
 * caller to supply. Phase 23.3's UI can wrap this in a `useActionState`-
 * compatible closure at the call site if that turns out to be convenient.
 */
export async function createBillingPortalSession(): Promise<CreatePortalSessionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, reason: 'not_authenticated' }
  }

  const { data: subscription } = await supabase.from('subscriptions').select('provider_customer_id').eq('user_id', user.id).maybeSingle()

  if (!subscription?.provider_customer_id) {
    return { ok: false, reason: 'no_paid_customer' }
  }

  const result = await createPaddleCustomerPortalSession(subscription.provider_customer_id)
  if (!result.ok) {
    return { ok: false, reason: 'provider_error' }
  }

  return { ok: true, url: result.url }
}
