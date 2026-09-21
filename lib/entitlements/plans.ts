/**
 * Phase 23.1, corrected, then extended to a fourth "Agency" tier for the
 * locked website-based commercial model — webioom's named commercial
 * plans. This is product-domain architecture, not billing-provider
 * architecture: no price, currency, or billing-provider product/price ID
 * appears anywhere in this file or is ever read by anything downstream of
 * it. Prices (Bloom €29/month, Bloom Pro €99/month, Agency €299/month —
 * see lib/billing/plan-presentation.ts for the customer-facing numbers,
 * including annual pricing) and the billing provider (Paddle) are both
 * free to change without touching this file or any of its consumers.
 *
 * The commercial unit is NUMBER OF WEBSITES, never page count — pricing
 * copy must never lead with `maxCrawlPages`. That field still exists purely
 * as an internal technical safeguard (a per-plan crawl-budget ceiling), a
 * separate concept from the customer-facing website limit below.
 */
export type PlanKey = 'free' | 'bloom' | 'bloom_pro' | 'agency'

/**
 * Sprint 3 (monitoring + notifications completion) — LOCKED cadence model.
 * `monitoringCadence` on each plan below is that plan's own CEILING (the
 * most frequent cadence it may run at), not necessarily its default:
 * Bloom's ceiling is its only real option (biweekly); Bloom Pro's ceiling
 * is weekly; Agency's ceiling is daily, but Agency's own settings default
 * to weekly (see monitoring-settings-form.tsx's `recommendedCadence`) —
 * daily is Agency's one genuinely configurable upgrade, not its default.
 * `'daily'` is kept as a real, valid cadence value specifically so Agency
 * retains that configurable ceiling; no plan actually defaults to it.
 */
export type MonitoringCadence = 'none' | 'biweekly' | 'weekly' | 'daily'

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
  /**
   * Phase 25B — the per-plan ceiling on how many pages a single site-wide
   * crawl run may process, read by lib/crawler/engine.ts's startCrawlRun
   * (via the caller-supplied `planMaxPages` option) as a second, independent
   * clamp alongside lib/crawler/limits.ts's own MAX_CRAWL_PAGES product-wide
   * safety ceiling. The two are deliberately not the same number: this one
   * can move freely as plans are repriced/repositioned without ever being
   * able to exceed the flat safety ceiling, which stays a constant no plan
   * can buy its way past. Sized off `maxWebsites` (1 / 3 / 10 -> a roughly
   * similar 1x / 5x / ~17x spread) rather than off any usage data, since
   * none exists yet for this brand-new capability: Free gets enough to
   * usefully cover a small brochure site, Bloom comfortably covers a real
   * small-to-medium business site, and Bloom Pro is set equal to the global
   * safety ceiling itself so it is never the binding constraint for this
   * plan's users.
   */
  maxCrawlPages: number
}

/**
 * The single source of truth for what each plan actually grants. Every
 * other module in lib/entitlements/ only ever reads from here — no plan
 * constant is ever duplicated or re-declared elsewhere in the codebase.
 *
 * FREE-SCAN -> PAID FUNNEL (locked product boundary): Free is a diagnosis/
 * acquisition experience only — `manualScansAllowed` stays `true` (a
 * customer must be able to actually run and view their scan), but
 * `aiFixesAllowed`/`directFixesAllowed` are `false`. Those two are read by
 * `lib/entitlements/service.ts`'s `canUseAiFix`/`canUseDirectFix`, which are
 * now genuinely wired into every fix-preparation ("prepare") and fix-
 * execution ("apply") server action across WordPress/Shopify/Wix (see each
 * file's own doc comment) — this is real, server-enforced gating, not just
 * pricing-page marketing copy. `aiFixesAllowed` gates the PREPARE step
 * (generating/previewing a proposed change — today always AI-assisted where
 * AI is used at all); `directFixesAllowed` gates the APPLY step (the actual
 * write to the connected platform). Bloom/Bloom Pro/Agency all grant both —
 * deliberately identical across every paid tier, since the locked product
 * boundary is Free-vs-paid, not a further split between paid tiers (Bloom
 * Pro/Agency differ from Bloom only in `maxWebsites`/`maxCrawlPages`, never
 * in which remediation capability they unlock).
 *
 * `maxWebsites` is the LOCKED commercial dimension for the website-based
 * pricing model: Free/Bloom = 1, Bloom Pro = 5, Agency = 20.
 * `monitoringCadence`/`alertsAllowed` are both live, server-enforced
 * entitlements consumed by the monitoring scheduler
 * (lib/monitoring/entitlement-reconciliation.ts) and the delivery pipeline
 * (lib/monitoring/delivery-service.ts) respectively — not forward-looking
 * hooks.
 */
export const PLAN_CAPABILITIES: Record<PlanKey, PlanCapabilities> = {
  free: {
    maxWebsites: 1,
    manualScansAllowed: true,
    aiFixesAllowed: false,
    directFixesAllowed: false,
    monitoringCadence: 'none',
    alertsAllowed: false,
    maxCrawlPages: 30,
  },
  bloom: {
    maxWebsites: 1,
    manualScansAllowed: true,
    aiFixesAllowed: true,
    directFixesAllowed: true,
    monitoringCadence: 'biweekly',
    alertsAllowed: true,
    maxCrawlPages: 150,
  },
  bloom_pro: {
    maxWebsites: 5,
    manualScansAllowed: true,
    aiFixesAllowed: true,
    directFixesAllowed: true,
    monitoringCadence: 'weekly',
    alertsAllowed: true,
    // Deliberately equal to lib/crawler/limits.ts's MAX_CRAWL_PAGES product-wide
    // safety ceiling (tests/entitlements.test.ts asserts this equality directly
    // so the two can never silently drift apart) — Bloom Pro is meant to be
    // bounded only by the platform-wide safety ceiling, never by its own plan.
    maxCrawlPages: 500,
  },
  agency: {
    maxWebsites: 20,
    manualScansAllowed: true,
    aiFixesAllowed: true,
    directFixesAllowed: true,
    monitoringCadence: 'daily',
    alertsAllowed: true,
    // Also pinned to the global safety ceiling — there is no higher crawl
    // budget to grant above Bloom Pro's, only more websites.
    maxCrawlPages: 500,
  },
}
