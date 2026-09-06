import type { PlanKey } from '@/lib/entitlements/plans'

/**
 * Phase 23.3 — the single source of truth for what CTA a plan card (on
 * `/pricing` or `/dashboard/billing`) should show, given who's looking at
 * it. Pure and deterministic so both surfaces can share it without
 * duplicating the plan-comparison logic, and so it's fully testable
 * without rendering anything.
 */
export type PlanCtaKind =
  | 'signup' // not logged in — send to signup/login first, never start a checkout
  | 'current' // this is the viewer's own current plan
  | 'upgrade' // this plan is strictly higher than the viewer's current plan — safe to offer checkout
  | 'included' // this plan is the viewer's current plan or lower — never invite a downgrade through a frontend-only action

const PLAN_RANK: Record<PlanKey, number> = { free: 0, bloom: 1, bloom_pro: 2 }

/**
 * `currentPlan` is only meaningful when `isLoggedIn` is true — for a
 * logged-in user, `lib/entitlements/subscription.ts`'s resolveEntitlements
 * always resolves to a real PlanKey (defaulting to 'free'), so there is no
 * "logged in with an unknown plan" state this function needs to handle.
 *
 * There is no backend support for downgrading a subscription today (Phase
 * 23.2 only ever creates NEW Paddle transactions) — this function never
 * returns 'upgrade' for a plan ranked at or below the viewer's current
 * plan, which is what keeps a Bloom Pro subscriber from ever being shown a
 * Bloom "upgrade" button that would actually be an unsupported downgrade.
 */
export function getPlanCtaKind(cardPlan: PlanKey, isLoggedIn: boolean, currentPlan: PlanKey): PlanCtaKind {
  if (!isLoggedIn) return 'signup'
  if (cardPlan === currentPlan) return 'current'
  return PLAN_RANK[cardPlan] > PLAN_RANK[currentPlan] ? 'upgrade' : 'included'
}
