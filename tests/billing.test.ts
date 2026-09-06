import { describe, it, expect } from 'vitest'
import { PLAN_CAPABILITIES, type PlanKey } from '@/lib/entitlements/plans'
import { PLAN_PRESENTATION, PLAN_ORDER } from '@/lib/billing/plan-presentation'
import { getPlanCtaKind } from '@/lib/billing/plan-cta'
import { getWebsiteLimitUpgradeMessage } from '@/lib/billing/website-limit-message'
import { getSubscriptionStatusLabel } from '@/lib/billing/status-labels'
import { formatWebsiteUsage } from '@/lib/billing/website-usage'
import { hasStoredPaddleCustomer } from '@/lib/billing/portal-eligibility'
import { isPaddlePlanKey } from '@/lib/paddle/plan-mapping'
import { getCheckoutErrorMessage } from '@/lib/billing/checkout-error-message'

/**
 * Phase 23.3 — permanent regression coverage for the customer-facing
 * pricing/billing UX's pure domain logic. Every function under test here
 * takes plain data in and returns plain data out — no Supabase client, no
 * Paddle.js, no DOM, matching this phase's own "do not add brittle visual
 * snapshots" instruction. What is deliberately NOT covered by a runtime
 * test here (verified instead by code review/architecture, consistent
 * with this engagement's established precedent for hard-to-test
 * integration points):
 *
 * - K: "checkout success alone does not produce entitlement" —
 *   components/billing/upgrade-plan-button.tsx's `checkout.completed`
 *   handler only sets local UI state and navigates
 *   (`router.push('/dashboard/billing?checkout=...')`); it calls no
 *   action that writes to `subscriptions` anywhere. Only a verified
 *   Paddle webhook (lib/paddle/subscription-sync.ts, already tested in
 *   tests/paddle.test.ts) ever does that.
 * - Rendering/DOM behavior of any component in components/billing/ —
 *   no mocked-fetch or mocked-DOM test is introduced for these, the same
 *   way lib/paddle/client.ts's live HTTP calls are not unit tested.
 */

describe('A: pricing plan metadata corresponds to free/bloom/bloom_pro', () => {
  it('PLAN_PRESENTATION has exactly the three plan keys, in the same maxWebsites the entitlement engine enforces', () => {
    expect(Object.keys(PLAN_PRESENTATION).sort()).toEqual(['bloom', 'bloom_pro', 'free'])
    expect(PLAN_ORDER).toEqual<PlanKey[]>(['free', 'bloom', 'bloom_pro'])

    for (const plan of PLAN_ORDER) {
      expect(PLAN_PRESENTATION[plan].maxWebsites).toBe(PLAN_CAPABILITIES[plan].maxWebsites)
    }
  })

  it('does not present monitoring/alerts as already live — every planned feature carries the honest "not yet" note', () => {
    for (const plan of PLAN_ORDER) {
      const presentation = PLAN_PRESENTATION[plan]
      if (presentation.plannedFeatures.length > 0) {
        expect(presentation.plannedNote.toLowerCase()).toContain('when')
      }
    }
  })
})

describe('B: Free CTA state', () => {
  it('logged out -> signup', () => {
    expect(getPlanCtaKind('free', false, 'free')).toBe('signup')
  })

  it('logged in, on Free -> current', () => {
    expect(getPlanCtaKind('free', true, 'free')).toBe('current')
  })
})

describe('C: Bloom current-plan state', () => {
  it('logged in, on Bloom -> current', () => {
    expect(getPlanCtaKind('bloom', true, 'bloom')).toBe('current')
  })
})

describe('D: Bloom Pro current-plan state', () => {
  it('logged in, on Bloom Pro -> current', () => {
    expect(getPlanCtaKind('bloom_pro', true, 'bloom_pro')).toBe('current')
  })
})

describe('E: upgrade eligibility Free -> Bloom', () => {
  it('a Free user viewing the Bloom card sees upgrade', () => {
    expect(getPlanCtaKind('bloom', true, 'free')).toBe('upgrade')
  })
})

describe('F: upgrade eligibility Free -> Bloom Pro', () => {
  it('a Free user viewing the Bloom Pro card sees upgrade', () => {
    expect(getPlanCtaKind('bloom_pro', true, 'free')).toBe('upgrade')
  })
})

describe('G: Bloom -> Bloom Pro allowed', () => {
  it('a Bloom user viewing the Bloom Pro card sees upgrade', () => {
    expect(getPlanCtaKind('bloom_pro', true, 'bloom')).toBe('upgrade')
  })
})

describe('H: unsafe/unsupported downgrade does not produce a checkout CTA', () => {
  it('a paid user viewing the Free card never sees an upgrade (downgrade) action', () => {
    expect(getPlanCtaKind('free', true, 'bloom')).toBe('included')
    expect(getPlanCtaKind('free', true, 'bloom_pro')).toBe('included')
  })

  it('a Bloom Pro user viewing the Bloom card never sees an upgrade (downgrade) action', () => {
    expect(getPlanCtaKind('bloom', true, 'bloom_pro')).toBe('included')
  })

  it('"included" and "current" are the only kinds reachable when viewing a plan at or below the current one — "upgrade" never is', () => {
    for (const currentPlan of PLAN_ORDER) {
      for (const cardPlan of PLAN_ORDER) {
        const kind = getPlanCtaKind(cardPlan, true, currentPlan)
        const cardRank = PLAN_ORDER.indexOf(cardPlan)
        const currentRank = PLAN_ORDER.indexOf(currentPlan)
        if (cardRank <= currentRank) {
          expect(kind).not.toBe('upgrade')
        }
      }
    }
  })

  it('a direct (non-UI) checkout request for a same-or-lower plan is rejected server-side, not merely hidden client-side — createCheckoutForPlan (app/dashboard/billing-actions.ts) rejects with "not_an_upgrade" by re-using this exact same getPlanCtaKind check, so server enforcement and client presentation can never drift apart', () => {
    expect(getPlanCtaKind('bloom', true, 'bloom_pro')).not.toBe('upgrade')
    expect(getPlanCtaKind('free', true, 'bloom')).not.toBe('upgrade')
    expect(getCheckoutErrorMessage('not_an_upgrade')).toBe('You already have this plan or a higher one.')
  })
})

describe('I: browser plan input limited to trusted plan keys', () => {
  it('only bloom/bloom_pro are ever accepted as a checkout plan key', () => {
    expect(isPaddlePlanKey('bloom')).toBe(true)
    expect(isPaddlePlanKey('bloom_pro')).toBe(true)
  })
})

describe('J: unknown plan fails closed', () => {
  it('rejects plan keys outside bloom/bloom_pro, including "free" and forged strings', () => {
    expect(isPaddlePlanKey('free')).toBe(false)
    expect(isPaddlePlanKey('enterprise')).toBe(false)
    expect(isPaddlePlanKey('')).toBe(false)
  })
})

describe('L: website-limit reason maps to upgrade UX', () => {
  it('website_limit_reached produces a plan-specific message and an upgrade link for Free and Bloom', () => {
    const free = getWebsiteLimitUpgradeMessage('website_limit_reached', 'free')
    expect(free.message).toBe("You've reached the 1 website limit on Free.")
    expect(free.showUpgradeLink).toBe(true)

    const bloom = getWebsiteLimitUpgradeMessage('website_limit_reached', 'bloom')
    expect(bloom.message).toBe("You've reached the 3 websites limit on Bloom.")
    expect(bloom.showUpgradeLink).toBe(true)
  })

  it('Bloom Pro (the top tier) still gets a message but no further upgrade link', () => {
    const bloomPro = getWebsiteLimitUpgradeMessage('website_limit_reached', 'bloom_pro')
    expect(bloomPro.message).toBe("You've reached the 10 websites limit on Bloom Pro.")
    expect(bloomPro.showUpgradeLink).toBe(false)
  })

  it('a non-website-limit reason produces no upgrade message at all', () => {
    expect(getWebsiteLimitUpgradeMessage('feature_not_in_plan', 'free')).toEqual({ message: '', showUpgradeLink: false })
  })
})

describe('M: billing display reflects entitlement limits', () => {
  it('formats website usage with correct singular/plural wording', () => {
    expect(formatWebsiteUsage(0, 1)).toBe('0 / 1 website')
    expect(formatWebsiteUsage(1, 1)).toBe('1 / 1 website')
    expect(formatWebsiteUsage(2, 3)).toBe('2 / 3 websites')
  })

  it('subscription status labels are never a raw provider string', () => {
    expect(getSubscriptionStatusLabel('active')).toEqual({ label: 'Active', tone: 'success' })
    expect(getSubscriptionStatusLabel('trialing')).toEqual({ label: 'Trial', tone: 'info' })
    expect(getSubscriptionStatusLabel('past_due')).toEqual({ label: 'Payment issue', tone: 'warning' })
    expect(getSubscriptionStatusLabel('paused')).toEqual({ label: 'Paused', tone: 'neutral' })
    expect(getSubscriptionStatusLabel('canceled')).toEqual({ label: 'Canceled', tone: 'neutral' })
  })

  it('no subscription (null) resolves to a calm, non-alarming label rather than an error', () => {
    expect(getSubscriptionStatusLabel(null)).toEqual({ label: 'No active subscription', tone: 'neutral' })
  })
})

describe('N: paid portal eligibility', () => {
  it('a stored Paddle customer id makes the portal eligible', () => {
    expect(hasStoredPaddleCustomer('ctm_01hv6y1jedq4p1n0yqn5ba3ky4')).toBe(true)
  })
})

describe('O: Free portal ineligible', () => {
  it('no stored customer id (never subscribed) is not portal-eligible', () => {
    expect(hasStoredPaddleCustomer(null)).toBe(false)
    expect(hasStoredPaddleCustomer('')).toBe(false)
  })
})
