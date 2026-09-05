/**
 * Phase 23.1, corrected — webioom's three named commercial plans. This is
 * product-domain architecture, not billing-provider architecture: no
 * price, currency, or billing-provider product/price ID appears anywhere
 * in this file or is ever read by anything downstream of it. Prices
 * (currently targeted at roughly €49/month for Bloom and €99/month for
 * Bloom Pro) and the eventual billing provider (Paddle is the current
 * candidate — see docs/entitlements.md) are both free to change without
 * touching this file or any of its consumers.
 */
export type PlanKey = 'free' | 'bloom' | 'bloom_pro'

/**
 * Represented now so Phase 24's monitoring/scheduling work has a field to
 * read from day one, even though no scan is currently scheduled by
 * anything — 'none' is the only value that describes today's actual
 * product behavior (manual scans only). 'weekly'/'daily' are reserved for
 * Phase 24 to interpret; this module makes no scheduling decisions itself.
 */
export type MonitoringCadence = 'none' | 'weekly' | 'daily'

/**
 * Only fields with a real, immediate consumer (Part 7's website limit) or
 * an explicitly requested future hook (Part 8) are included — no
 * speculative team/seat/API-quota fields. `manualScansAllowed`/
 * `aiFixesAllowed`/`directFixesAllowed`/`alertsAllowed` are booleans today
 * (not usage counters) because the current product audit found no existing
 * per-action usage tracking to build a counter on top of — a counter is a
 * Phase 24+ concern once monitoring/usage metering exists.
 */
export type PlanCapabilities = {
  maxWebsites: number
  manualScansAllowed: boolean
  aiFixesAllowed: boolean
  directFixesAllowed: boolean
  monitoringCadence: MonitoringCadence
  alertsAllowed: boolean
}

/**
 * The single source of truth for what each plan actually grants. Every
 * other module in lib/entitlements/ only ever reads from here — no plan
 * constant is ever duplicated or re-declared elsewhere in the codebase.
 *
 * `manualScansAllowed`/`aiFixesAllowed`/`directFixesAllowed` are `true` for
 * ALL THREE plans — this preserves every existing user's current behavior
 * exactly; no shipped functionality is paywalled by this correction. Adding
 * a real restriction on any of these later is a one-line change per plan
 * here, with no consumer needing to change (see docs/entitlements.md).
 *
 * `maxWebsites` is the one field actually enforced today (Part 7 of Phase
 * 23.1). `monitoringCadence`/`alertsAllowed` are represented per-plan as
 * forward-looking hooks for Phase 24 and are not consumed by anything yet.
 */
export const PLAN_CAPABILITIES: Record<PlanKey, PlanCapabilities> = {
  free: {
    maxWebsites: 1,
    manualScansAllowed: true,
    aiFixesAllowed: true,
    directFixesAllowed: true,
    monitoringCadence: 'none',
    alertsAllowed: false,
  },
  bloom: {
    maxWebsites: 3,
    manualScansAllowed: true,
    aiFixesAllowed: true,
    directFixesAllowed: true,
    monitoringCadence: 'weekly',
    alertsAllowed: true,
  },
  bloom_pro: {
    maxWebsites: 10,
    manualScansAllowed: true,
    aiFixesAllowed: true,
    directFixesAllowed: true,
    monitoringCadence: 'daily',
    alertsAllowed: true,
  },
}
