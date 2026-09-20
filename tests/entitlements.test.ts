import { describe, it, expect } from 'vitest'
import { PLAN_CAPABILITIES } from '@/lib/entitlements/plans'
import { MAX_CRAWL_PAGES } from '@/lib/crawler/limits'
import { resolveEntitlements, type SubscriptionRecord } from '@/lib/entitlements/subscription'
import {
  isCapabilityAllowed,
  evaluateAddWebsite,
  evaluateManualScan,
  evaluateAiFix,
  evaluateDirectFix,
  evaluateAlerts,
  getMonitoringCadence,
  evaluateMonitoringEnable,
  evaluateMonitoringCadenceChoice,
} from '@/lib/entitlements/capabilities'

/**
 * Phase 23.1, corrected for the three-plan model (free / bloom /
 * bloom_pro) and the Paddle-aligned status vocabulary (active / trialing /
 * past_due / paused / canceled). Everything here is pure (resolveEntitlements,
 * the evaluate-prefixed capability functions, and isCapabilityAllowed all
 * take plain data in and return plain data out) — no Supabase client, no
 * live database, and no billing provider of any kind, matching this
 * phase's explicit "do not require live Supabase for pure tests"
 * instruction. The DB-touching wrappers in lib/entitlements/service.ts are
 * intentionally thin pass-throughs to these same pure functions and are
 * not separately unit tested here, the same way the rest of this codebase
 * tests its pure fixability/capability logic directly rather than mocking
 * Supabase.
 */

const activeBloomRow: SubscriptionRecord = {
  plan_key: 'bloom',
  status: 'active',
  current_period_end: null,
  trial_end: null,
}

const activeBloomProRow: SubscriptionRecord = {
  plan_key: 'bloom_pro',
  status: 'active',
  current_period_end: null,
  trial_end: null,
}

const activeAgencyRow: SubscriptionRecord = {
  plan_key: 'agency',
  status: 'active',
  current_period_end: null,
  trial_end: null,
}

describe('resolveEntitlements', () => {
  it('A: a user with no subscription row resolves to the free plan, not marked inactive', () => {
    const entitlements = resolveEntitlements(null)
    expect(entitlements.plan).toBe('free')
    expect(entitlements.subscriptionInactive).toBe(false)
    expect(entitlements).toMatchObject(PLAN_CAPABILITIES.free)
  })

  it('B: an active Bloom subscription resolves to Bloom entitlements', () => {
    const entitlements = resolveEntitlements(activeBloomRow)
    expect(entitlements.plan).toBe('bloom')
    expect(entitlements.subscriptionInactive).toBe(false)
    expect(entitlements).toMatchObject(PLAN_CAPABILITIES.bloom)
  })

  it('an active Bloom Pro subscription resolves to Bloom Pro entitlements', () => {
    const entitlements = resolveEntitlements(activeBloomProRow)
    expect(entitlements.plan).toBe('bloom_pro')
    expect(entitlements.subscriptionInactive).toBe(false)
    expect(entitlements).toMatchObject(PLAN_CAPABILITIES.bloom_pro)
  })

  it('an active Agency subscription resolves to Agency entitlements', () => {
    const entitlements = resolveEntitlements(activeAgencyRow)
    expect(entitlements.plan).toBe('agency')
    expect(entitlements.subscriptionInactive).toBe(false)
    expect(entitlements).toMatchObject(PLAN_CAPABILITIES.agency)
  })

  it('trialing grants the named plan', () => {
    const entitlements = resolveEntitlements({ ...activeBloomRow, status: 'trialing' })
    expect(entitlements.plan).toBe('bloom')
    expect(entitlements.subscriptionInactive).toBe(false)
  })

  it('past_due grants the named plan for now (current safe default, not a finalized grace-period decision — see docs/entitlements.md)', () => {
    const entitlements = resolveEntitlements({ ...activeBloomProRow, status: 'past_due' })
    expect(entitlements.plan).toBe('bloom_pro')
    expect(entitlements.subscriptionInactive).toBe(false)
    expect(entitlements).toMatchObject(PLAN_CAPABILITIES.bloom_pro)
  })

  it('paused fails closed to free and is marked inactive', () => {
    const entitlements = resolveEntitlements({ ...activeBloomRow, status: 'paused' })
    expect(entitlements.plan).toBe('free')
    expect(entitlements.subscriptionInactive).toBe(true)
    expect(entitlements.maxWebsites).toBe(PLAN_CAPABILITIES.free.maxWebsites)
  })

  it('C: canceled fails closed to free and is marked inactive', () => {
    const entitlements = resolveEntitlements({ ...activeBloomProRow, status: 'canceled' })
    expect(entitlements.plan).toBe('free')
    expect(entitlements.subscriptionInactive).toBe(true)
    expect(entitlements.maxWebsites).toBe(PLAN_CAPABILITIES.free.maxWebsites)
  })

  it('D: an unknown plan_key fails closed to free, marked inactive — never thrown, never upgraded', () => {
    const entitlements = resolveEntitlements({ ...activeBloomRow, plan_key: 'enterprise' })
    expect(entitlements.plan).toBe('free')
    expect(entitlements.subscriptionInactive).toBe(true)
  })

  it('E: an unknown status fails closed to free, marked inactive', () => {
    const entitlements = resolveEntitlements({ ...activeBloomRow, status: 'lifetime_deal' })
    expect(entitlements.plan).toBe('free')
    expect(entitlements.subscriptionInactive).toBe(true)
  })

  it('a trialing row grants its named plan before trial_end', () => {
    const now = new Date('2026-01-15T00:00:00Z')
    const entitlements = resolveEntitlements(
      { plan_key: 'bloom_pro', status: 'trialing', current_period_end: null, trial_end: '2026-01-20T00:00:00Z' },
      now
    )
    expect(entitlements.plan).toBe('bloom_pro')
    expect(entitlements.subscriptionInactive).toBe(false)
  })

  it('a trialing row whose trial_end has already passed fails closed to free, marked inactive', () => {
    const now = new Date('2026-01-25T00:00:00Z')
    const entitlements = resolveEntitlements(
      { plan_key: 'bloom_pro', status: 'trialing', current_period_end: null, trial_end: '2026-01-20T00:00:00Z' },
      now
    )
    expect(entitlements.plan).toBe('free')
    expect(entitlements.subscriptionInactive).toBe(true)
  })

  it('a forged/extra field on the subscription row cannot influence the resolved entitlements', () => {
    // Simulates a hypothetical compromised or careless caller attaching
    // browser-supplied data to what should be a trusted DB row — only
    // plan_key/status/trial_end are ever read; everything else is ignored.
    const forged = { ...activeBloomProRow, maxWebsites: 999999, aiFixesAllowed: false } as SubscriptionRecord &
      Record<string, unknown>
    const entitlements = resolveEntitlements(forged)
    expect(entitlements.maxWebsites).toBe(PLAN_CAPABILITIES.bloom_pro.maxWebsites)
    expect(entitlements.aiFixesAllowed).toBe(PLAN_CAPABILITIES.bloom_pro.aiFixesAllowed)
  })

  it('a forged plan_key not in the known set cannot grant paid-plan values', () => {
    const forged = resolveEntitlements({ ...activeBloomProRow, plan_key: 'bloom-pro-but-actually-free-forged' })
    expect(forged.plan).toBe('free')
    expect(forged.maxWebsites).toBe(PLAN_CAPABILITIES.free.maxWebsites)
  })
})

describe('website limits by plan (locked website-based commercial model)', () => {
  it('Free website limit is 1', () => {
    expect(PLAN_CAPABILITIES.free.maxWebsites).toBe(1)
    const free = resolveEntitlements(null)
    expect(evaluateAddWebsite(free, 1)).toEqual({ allowed: false, reason: 'website_limit_reached' })
    expect(evaluateAddWebsite(free, 0)).toEqual({ allowed: true })
  })

  it('Bloom website limit is 1', () => {
    expect(PLAN_CAPABILITIES.bloom.maxWebsites).toBe(1)
    const bloom = resolveEntitlements(activeBloomRow)
    expect(evaluateAddWebsite(bloom, 1)).toEqual({ allowed: false, reason: 'website_limit_reached' })
    expect(evaluateAddWebsite(bloom, 0)).toEqual({ allowed: true })
  })

  it('Bloom Pro website limit is 5', () => {
    expect(PLAN_CAPABILITIES.bloom_pro.maxWebsites).toBe(5)
    const bloomPro = resolveEntitlements(activeBloomProRow)
    expect(evaluateAddWebsite(bloomPro, 5)).toEqual({ allowed: false, reason: 'website_limit_reached' })
    expect(evaluateAddWebsite(bloomPro, 4)).toEqual({ allowed: true })
  })

  it('Agency website limit is 20', () => {
    expect(PLAN_CAPABILITIES.agency.maxWebsites).toBe(20)
    const agency = resolveEntitlements(activeAgencyRow)
    expect(evaluateAddWebsite(agency, 20)).toEqual({ allowed: false, reason: 'website_limit_reached' })
    expect(evaluateAddWebsite(agency, 19)).toEqual({ allowed: true })
  })

  it('the limit check is a pure function of a server-derived count, never a client-supplied override', () => {
    // evaluateAddWebsite's signature itself is the guarantee: it takes only
    // (entitlements, currentWebsiteCount), with no parameter through which
    // a caller could pass an already-decided "allowed" verdict or a
    // different limit. The real server-derivation of currentWebsiteCount
    // happens in lib/entitlements/service.ts's canAddWebsite (a `count(*)
    // where user_id = <session user>` query), which this pure test cannot
    // exercise without a live Supabase — this test instead pins down the
    // one contract that call site depends on.
    const free = resolveEntitlements(null)
    expect(evaluateAddWebsite(free, 0).allowed).toBe(true)
    expect(evaluateAddWebsite(free, 1).allowed).toBe(false)
  })
})

describe('crawl page budgets by plan (Phase 25B)', () => {
  it('Free crawl budget is 30 pages', () => {
    expect(PLAN_CAPABILITIES.free.maxCrawlPages).toBe(30)
  })

  it('Bloom crawl budget is 150 pages', () => {
    expect(PLAN_CAPABILITIES.bloom.maxCrawlPages).toBe(150)
  })

  it('Bloom Pro and Agency crawl budgets both equal the product-wide safety ceiling', () => {
    // Pinned to the actual MAX_CRAWL_PAGES constant, not a duplicated
    // literal, so the two can never silently drift apart. Agency has no
    // higher crawl budget to grant above Bloom Pro's — only more websites
    // — so the two are deliberately equal, not strictly greater.
    expect(PLAN_CAPABILITIES.bloom_pro.maxCrawlPages).toBe(MAX_CRAWL_PAGES)
    expect(PLAN_CAPABILITIES.agency.maxCrawlPages).toBe(MAX_CRAWL_PAGES)
  })

  it('crawl budgets increase (or stay at the ceiling) with plan tier, and no plan can exceed the global safety ceiling', () => {
    expect(PLAN_CAPABILITIES.free.maxCrawlPages).toBeLessThan(PLAN_CAPABILITIES.bloom.maxCrawlPages)
    expect(PLAN_CAPABILITIES.bloom.maxCrawlPages).toBeLessThan(PLAN_CAPABILITIES.bloom_pro.maxCrawlPages)
    expect(PLAN_CAPABILITIES.bloom_pro.maxCrawlPages).toBeLessThanOrEqual(PLAN_CAPABILITIES.agency.maxCrawlPages)
    for (const plan of Object.values(PLAN_CAPABILITIES)) {
      expect(plan.maxCrawlPages).toBeLessThanOrEqual(MAX_CRAWL_PAGES)
    }
  })
})

describe('monitoring cadence by plan', () => {
  it('Free monitoring cadence is none', () => {
    expect(getMonitoringCadence(resolveEntitlements(null))).toBe('none')
  })

  it('Bloom monitoring cadence is weekly', () => {
    expect(getMonitoringCadence(resolveEntitlements(activeBloomRow))).toBe('weekly')
  })

  it('Bloom Pro monitoring cadence is daily', () => {
    expect(getMonitoringCadence(resolveEntitlements(activeBloomProRow))).toBe('daily')
  })

  it('Agency monitoring cadence is daily', () => {
    expect(getMonitoringCadence(resolveEntitlements(activeAgencyRow))).toBe('daily')
  })
})

describe('evaluateMonitoringEnable — Sprint 2, Prompt 1', () => {
  it('Free is denied, with a plan-based reason (monitoringCadence is none)', () => {
    expect(evaluateMonitoringEnable(resolveEntitlements(null))).toEqual({ allowed: false, reason: 'feature_not_in_plan' })
  })

  it('Bloom (weekly cadence) is allowed to enable monitoring', () => {
    expect(evaluateMonitoringEnable(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
  })

  it('Bloom Pro (daily cadence) is allowed to enable monitoring', () => {
    expect(evaluateMonitoringEnable(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
  })

  it('a lapsed-paid user is denied with subscription_inactive, not feature_not_in_plan', () => {
    const lapsed = resolveEntitlements({ ...activeBloomProRow, status: 'canceled' })
    expect(evaluateMonitoringEnable(lapsed)).toEqual({ allowed: false, reason: 'subscription_inactive' })
  })
})

describe('evaluateMonitoringCadenceChoice — Sprint 2, Prompt 1', () => {
  it('Free is denied any cadence choice, since it cannot enable monitoring at all', () => {
    expect(evaluateMonitoringCadenceChoice(resolveEntitlements(null), 'weekly')).toEqual({ allowed: false, reason: 'feature_not_in_plan' })
  })

  it('Bloom may choose weekly (its own granted cadence)', () => {
    expect(evaluateMonitoringCadenceChoice(resolveEntitlements(activeBloomRow), 'weekly')).toEqual({ allowed: true })
  })

  it('Bloom is denied requesting daily — more frequent than its plan grants — never silently clamped to weekly', () => {
    expect(evaluateMonitoringCadenceChoice(resolveEntitlements(activeBloomRow), 'daily')).toEqual({ allowed: false, reason: 'feature_not_in_plan' })
  })

  it('Bloom Pro (daily-granting plan) may still choose the LESS frequent weekly cadence if it prefers', () => {
    expect(evaluateMonitoringCadenceChoice(resolveEntitlements(activeBloomProRow), 'weekly')).toEqual({ allowed: true })
  })

  it('Bloom Pro may choose daily (its own granted cadence)', () => {
    expect(evaluateMonitoringCadenceChoice(resolveEntitlements(activeBloomProRow), 'daily')).toEqual({ allowed: true })
  })
})

describe('alerts by plan', () => {
  it('Free alerts are false, with a plan-based reason', () => {
    expect(evaluateAlerts(resolveEntitlements(null))).toEqual({ allowed: false, reason: 'feature_not_in_plan' })
  })

  it('Bloom alerts are true', () => {
    expect(evaluateAlerts(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
  })

  it('Bloom Pro alerts are true', () => {
    expect(evaluateAlerts(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
  })

  it('Agency alerts are true', () => {
    expect(evaluateAlerts(resolveEntitlements(activeAgencyRow))).toEqual({ allowed: true })
  })

  it('a lapsed-paid user denied a paid-only feature gets subscription_inactive, not feature_not_in_plan', () => {
    const lapsed = resolveEntitlements({ ...activeBloomProRow, status: 'canceled' })
    expect(evaluateAlerts(lapsed)).toEqual({ allowed: false, reason: 'subscription_inactive' })
  })
})

describe('free-scan -> paid funnel: initial diagnosis stays free, remediation execution requires a paid plan', () => {
  it('manual scans (the initial diagnosis) are allowed on every plan, including Free — the scan itself is never paywalled', () => {
    expect(evaluateManualScan(resolveEntitlements(null))).toEqual({ allowed: true })
    expect(evaluateManualScan(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
    expect(evaluateManualScan(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
    expect(evaluateManualScan(resolveEntitlements(activeAgencyRow))).toEqual({ allowed: true })
  })

  it('Free cannot prepare AI-assisted fixes — denied with a plan-based reason, not silently allowed', () => {
    expect(evaluateAiFix(resolveEntitlements(null))).toEqual({ allowed: false, reason: 'feature_not_in_plan' })
  })

  it('Free cannot apply direct fixes — denied with a plan-based reason', () => {
    expect(evaluateDirectFix(resolveEntitlements(null))).toEqual({ allowed: false, reason: 'feature_not_in_plan' })
  })

  it('every paid plan (Bloom, Bloom Pro, Agency) can prepare AI-assisted fixes — identical across paid tiers, since the locked boundary is Free-vs-paid, not a further split between paid tiers', () => {
    expect(evaluateAiFix(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
    expect(evaluateAiFix(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
    expect(evaluateAiFix(resolveEntitlements(activeAgencyRow))).toEqual({ allowed: true })
  })

  it('every paid plan (Bloom, Bloom Pro, Agency) can apply direct fixes', () => {
    expect(evaluateDirectFix(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
    expect(evaluateDirectFix(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
    expect(evaluateDirectFix(resolveEntitlements(activeAgencyRow))).toEqual({ allowed: true })
  })

  it('a paid subscriber whose subscription has lapsed is denied with subscription_inactive, not feature_not_in_plan — distinguishing "never had this" from "used to have this"', () => {
    const lapsedBloom = resolveEntitlements({ ...activeBloomRow, status: 'canceled' })
    expect(evaluateAiFix(lapsedBloom)).toEqual({ allowed: false, reason: 'subscription_inactive' })
    expect(evaluateDirectFix(lapsedBloom)).toEqual({ allowed: false, reason: 'subscription_inactive' })
  })
})

describe('isCapabilityAllowed', () => {
  it('an unknown capability key does not default open — it is denied, not treated as truthy/undefined', () => {
    const bloomPro = resolveEntitlements(activeBloomProRow)
    // @ts-expect-error — deliberately forging a capability key outside the
    // known union, exactly the way a value that skipped compile-time
    // checking (a cast, a deserialized string) could reach this function.
    expect(isCapabilityAllowed(bloomPro, 'somethingNotReal')).toBe(false)
  })
})
