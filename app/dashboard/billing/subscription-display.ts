import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { SubscriptionStatus } from '@/lib/entitlements/subscription'

export type SubscriptionDisplayInfo = {
  status: SubscriptionStatus | null
  providerCustomerId: string | null
}

const KNOWN_STATUSES = new Set<string>(['active', 'trialing', 'past_due', 'paused', 'canceled'] satisfies SubscriptionStatus[])

/**
 * Display-only read of this session's own `subscriptions` row — separate
 * from `lib/entitlements/`'s `getCurrentUserEntitlements` on purpose:
 * entitlement RESOLUTION (what capabilities this user has) is that
 * module's job and is not duplicated here; this function exists only to
 * surface the raw `status` and whether a Paddle customer id is on file,
 * for human-readable display (`lib/billing/status-labels.ts`) and to
 * decide whether to show the "Manage billing" control
 * (`lib/billing/portal-eligibility.ts`). Uses the ordinary session-aware
 * client — RLS's own `subscriptions_select_own` policy is what makes this
 * safe, exactly like `app/dashboard/billing-actions.ts`'s own reads.
 * Never returns a Paddle subscription/customer ID for display — only for
 * the internal eligibility check.
 */
export async function getSubscriptionDisplayInfo(): Promise<SubscriptionDisplayInfo> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { status: null, providerCustomerId: null }

  const { data } = await supabase.from('subscriptions').select('status, provider_customer_id').eq('user_id', user.id).maybeSingle()

  if (!data) return { status: null, providerCustomerId: null }

  const rawStatus = (data as Record<string, unknown>).status
  const status = typeof rawStatus === 'string' && KNOWN_STATUSES.has(rawStatus) ? (rawStatus as SubscriptionStatus) : null

  const rawCustomerId = (data as Record<string, unknown>).provider_customer_id
  const providerCustomerId = typeof rawCustomerId === 'string' ? rawCustomerId : null

  return { status, providerCustomerId }
}
