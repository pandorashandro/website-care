import { PLAN_CAPABILITIES, type PlanKey } from '@/lib/entitlements/plans'

/**
 * Phase 23.3 — customer-facing plan presentation, kept as a single source
 * of truth shared by `/pricing` and `/dashboard/billing` so the two
 * surfaces can never show different numbers for the same plan. Prices are
 * presentation values ONLY — never read by, or fed into,
 * `lib/entitlements/` or `lib/paddle/`'s price-ID mapping, per this
 * phase's explicit instruction that commercial pricing must not be
 * embedded into entitlement/Paddle logic. `maxWebsites` here is not a
 * second source of truth either — it is read directly from
 * `PLAN_CAPABILITIES` so this file cannot silently drift from what the
 * entitlement engine actually enforces (see tests/billing.test.ts's plan
 * A test).
 */
export type PlanPresentation = {
  plan: PlanKey
  name: string
  priceLabel: string
  tagline: string
  maxWebsites: number
  /** Bullets already true today, independent of monitoring/alerts (Phase 24+). */
  liveFeatures: string[]
  /**
   * Bullets describing a real, already-enforced entitlement
   * (`monitoringCadence`/`alertsAllowed`) whose underlying engine
   * (scheduled scans, notifications) has not shipped yet — always
   * rendered with `plannedNote`, never presented as already operational.
   * See docs/paddle-billing.md and this phase's brief: "do not say
   * 'WEBIOOM monitors your website weekly' yet if it doesn't."
   */
  plannedFeatures: string[]
  plannedNote: string
}

const PLANNED_NOTE = 'Included when automatic monitoring launches'

export const PLAN_PRESENTATION: Record<PlanKey, PlanPresentation> = {
  free: {
    plan: 'free',
    name: 'Free',
    priceLabel: '€0',
    tagline: 'Discover what is holding your website back.',
    maxWebsites: PLAN_CAPABILITIES.free.maxWebsites,
    liveFeatures: [
      '1 website',
      'Website health scanning',
      'Issue prioritization',
      'Recommendations',
      'Safe Fix & AI-assisted fixes where already supported',
    ],
    plannedFeatures: [],
    plannedNote: PLANNED_NOTE,
  },
  bloom: {
    plan: 'bloom',
    name: 'Bloom',
    priceLabel: '€49/month',
    tagline: 'Fix problems and keep your website healthy.',
    maxWebsites: PLAN_CAPABILITIES.bloom.maxWebsites,
    liveFeatures: ['Up to 3 websites', 'Everything in Free'],
    plannedFeatures: ['Weekly monitoring', 'Alerts'],
    plannedNote: PLANNED_NOTE,
  },
  bloom_pro: {
    plan: 'bloom_pro',
    name: 'Bloom Pro',
    priceLabel: '€99/month',
    tagline: 'Continuously manage multiple websites with higher limits and daily monitoring.',
    maxWebsites: PLAN_CAPABILITIES.bloom_pro.maxWebsites,
    liveFeatures: ['Up to 10 websites', 'Everything in Bloom', 'Built for freelancers and small agencies managing multiple sites'],
    plannedFeatures: ['Daily monitoring'],
    plannedNote: PLANNED_NOTE,
  },
}

export const PLAN_ORDER: PlanKey[] = ['free', 'bloom', 'bloom_pro']
