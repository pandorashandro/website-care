import { PLAN_CAPABILITIES, type PlanKey } from '@/lib/entitlements/plans'

/**
 * Customer-facing plan presentation, kept as a single source of truth
 * shared by `/pricing` and `/dashboard/billing` so the two surfaces can
 * never show different numbers for the same plan. Prices are presentation
 * values ONLY — never read by, or fed into, `lib/entitlements/` or
 * `lib/paddle/`'s price-ID mapping, so commercial pricing stays fully
 * decoupled from entitlement/Paddle logic. `maxWebsites` here is not a
 * second source of truth either — it is read directly from
 * `PLAN_CAPABILITIES` so this file cannot silently drift from what the
 * entitlement engine actually enforces (see tests/billing.test.ts's plan A
 * test).
 *
 * LOCKED commercial model: website-count-based pricing, four tiers.
 * `monthlyPrice`/`annualPrice` are plain numbers (EUR) so the pricing
 * page's Monthly/Yearly toggle can compute "Save 2 months" and format both
 * consistently — `annualPrice` is always exactly 10× `monthlyPrice`
 * (2 months free), never a separately-set number that could drift out of
 * that relationship by accident.
 *
 * IMPORTANT: today's Paddle checkout only ever charges the MONTHLY price
 * regardless of which billing-cycle view a visitor is looking at on
 * `/pricing` — see app/(public)/pricing/page.tsx's own doc comment and
 * this phase's final report for why a real annual Paddle checkout is
 * explicitly out of scope here (it would require inventing new Paddle
 * price IDs, which is not this codebase's call to make).
 */
export type PlanPresentation = {
  plan: PlanKey
  /** Short name used everywhere EXCEPT the pricing page's own card headline (billing dashboard, upgrade CTAs, limit-reached messages, etc.) — e.g. "Free". */
  name: string
  /** The pricing card's own big headline — matches `name` for every paid plan; only Free's differs ("Free Website Scan"), matching this phase's exact card-title spec. */
  cardTitle: string
  tagline: string
  maxWebsites: number
  /** EUR, per month. `null` for Free (no charge at all). */
  monthlyPrice: number | null
  /** EUR, total per year (already discounted — always 10× monthlyPrice). `null` for Free. */
  annualPrice: number | null
  /** Simple, always-monthly label for surfaces with no billing-cycle toggle (e.g. /dashboard/billing). */
  priceLabel: string
  /** Bullets already true today. */
  liveFeatures: string[]
  /**
   * Bullets describing a real, already-enforced entitlement
   * (`monitoringCadence`/`alertsAllowed`) whose underlying engine
   * (scheduled scans, notifications) has not shipped yet — always
   * rendered as "coming soon," never presented as already operational.
   */
  plannedFeatures: string[]
  plannedNote: string
}

const PLANNED_NOTE = 'Coming soon'

export const PLAN_PRESENTATION: Record<PlanKey, PlanPresentation> = {
  free: {
    plan: 'free',
    name: 'Free',
    cardTitle: 'Free Website Scan',
    tagline: "See what's wrong with your website.",
    maxWebsites: PLAN_CAPABILITIES.free.maxWebsites,
    monthlyPrice: null,
    annualPrice: null,
    priceLabel: '€0',
    liveFeatures: [
      'Scan 1 website',
      'Website Health score',
      '7 pillar analysis overview',
      'Key issues and recommendations',
      'Sample affected pages and evidence',
    ],
    plannedFeatures: [],
    plannedNote: PLANNED_NOTE,
  },
  bloom: {
    plan: 'bloom',
    name: 'Bloom',
    cardTitle: 'Bloom',
    tagline: 'For business owners and growing websites.',
    maxWebsites: PLAN_CAPABILITIES.bloom.maxWebsites,
    monthlyPrice: 29,
    annualPrice: 290,
    priceLabel: '€29/month',
    liveFeatures: [
      '1 website',
      'Full 7-pillar analysis',
      'Detailed reports — plain-language summaries with technical details',
      'Prioritized findings ("Fix These First")',
      'Guided fixes and recommendations',
      'Safe Fix where supported',
      'AI-assisted improvements where supported',
      'Integrations (e.g. WordPress)',
      'Manual scans',
      'Improvement history',
    ],
    plannedFeatures: ['Weekly monitoring'],
    plannedNote: PLANNED_NOTE,
  },
  bloom_pro: {
    plan: 'bloom_pro',
    name: 'Bloom Pro',
    cardTitle: 'Bloom Pro',
    tagline: 'For freelancers, professionals and multiple websites.',
    maxWebsites: PLAN_CAPABILITIES.bloom_pro.maxWebsites,
    monthlyPrice: 99,
    annualPrice: 990,
    priceLabel: '€99/month',
    liveFeatures: ['Up to 5 websites', 'Everything in Bloom', 'Higher page-crawl limits per scan', 'Priority support'],
    plannedFeatures: ['Daily monitoring', 'Alerts for critical issues'],
    plannedNote: PLANNED_NOTE,
  },
  agency: {
    plan: 'agency',
    name: 'Agency',
    cardTitle: 'Agency',
    tagline: 'For agencies and larger portfolios.',
    maxWebsites: PLAN_CAPABILITIES.agency.maxWebsites,
    monthlyPrice: 299,
    annualPrice: 2990,
    priceLabel: '€299/month',
    liveFeatures: ['Up to 20 websites', 'Everything in Bloom Pro', 'Priority support'],
    // Client organization / team access / white-label reporting / a
    // portfolio overview do not exist in the product yet — never presented
    // as live (see docs/entitlements.md and this phase's final report).
    plannedFeatures: ['Client organization', 'Team access', 'White-label reports', 'Portfolio overview'],
    plannedNote: PLANNED_NOTE,
  },
}

export const PLAN_ORDER: PlanKey[] = ['free', 'bloom', 'bloom_pro', 'agency']
