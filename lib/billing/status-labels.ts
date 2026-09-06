import type { SubscriptionStatus } from '@/lib/entitlements/subscription'
import type { BadgeTone } from '@/components/ui/badge'

export type SubscriptionStatusPresentation = { label: string; tone: BadgeTone }

/**
 * Customer-facing label for the raw subscription status stored on this
 * user's `subscriptions` row — display only, never used for any
 * entitlement/authorization decision (that is `resolveEntitlements`'s job
 * in `lib/entitlements/subscription.ts`, which this module does not
 * duplicate or replace). `null` covers both "no subscription row at all"
 * and "an unrecognized status" — both are shown identically and
 * unalarmingly, never as an error, matching the entitlement engine's own
 * fail-closed-to-free treatment of both cases.
 */
export function getSubscriptionStatusLabel(status: SubscriptionStatus | null): SubscriptionStatusPresentation {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'success' }
    case 'trialing':
      return { label: 'Trial', tone: 'info' }
    case 'past_due':
      return { label: 'Payment issue', tone: 'warning' }
    case 'paused':
      return { label: 'Paused', tone: 'neutral' }
    case 'canceled':
      return { label: 'Canceled', tone: 'neutral' }
    default:
      return { label: 'No active subscription', tone: 'neutral' }
  }
}
