import { describe, it, expect } from 'vitest'
import { PLAN_CAPABILITIES } from '@/lib/entitlements/plans'
import { resolveEntitlements, type SubscriptionRecord } from '@/lib/entitlements/subscription'
import {
  isCapabilityAllowed,
  evaluateAddWebsite,
  evaluateManualScan,
  evaluateAiFix,
  evaluateDirectFix,
  evaluateAlerts,
  getMonitoringCadence,
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

describe('website limits by plan', () => {
  it('Free website limit is 1', () => {
    expect(PLAN_CAPABILITIES.free.maxWebsites).toBe(1)
    const free = resolveEntitlements(null)
    expect(evaluateAddWebsite(free, 1)).toEqual({ allowed: false, reason: 'website_limit_reached' })
    expect(evaluateAddWebsite(free, 0)).toEqual({ allowed: true })
  })

  it('Bloom website limit is 3', () => {
    expect(PLAN_CAPABILITIES.bloom.maxWebsites).toBe(3)
    const bloom = resolveEntitlements(activeBloomRow)
    expect(evaluateAddWebsite(bloom, 3)).toEqual({ allowed: false, reason: 'website_limit_reached' })
    expect(evaluateAddWebsite(bloom, 2)).toEqual({ allowed: true })
  })

  it('Bloom Pro website limit is 10', () => {
    expect(PLAN_CAPABILITIES.bloom_pro.maxWebsites).toBe(10)
    const bloomPro = resolveEntitlements(activeBloomProRow)
    expect(evaluateAddWebsite(bloomPro, 10)).toEqual({ allowed: false, reason: 'website_limit_reached' })
    expect(evaluateAddWebsite(bloomPro, 9)).toEqual({ allowed: true })
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

  it('a lapsed-paid user denied a paid-only feature gets subscription_inactive, not feature_not_in_plan', () => {
    const lapsed = resolveEntitlements({ ...activeBloomProRow, status: 'canceled' })
    expect(evaluateAlerts(lapsed)).toEqual({ allowed: false, reason: 'subscription_inactive' })
  })
})

describe('shipped-functionality preservation across all three plans', () => {
  it('manual scans are currently allowed on every plan', () => {
    expect(evaluateManualScan(resolveEntitlements(null))).toEqual({ allowed: true })
    expect(evaluateManualScan(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
    expect(evaluateManualScan(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
  })

  it('AI-assisted fixes are currently allowed on every plan', () => {
    expect(evaluateAiFix(resolveEntitlements(null))).toEqual({ allowed: true })
    expect(evaluateAiFix(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
    expect(evaluateAiFix(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
  })

  it('direct fixes are currently allowed on every plan', () => {
    expect(evaluateDirectFix(resolveEntitlements(null))).toEqual({ allowed: true })
    expect(evaluateDirectFix(resolveEntitlements(activeBloomRow))).toEqual({ allowed: true })
    expect(evaluateDirectFix(resolveEntitlements(activeBloomProRow))).toEqual({ allowed: true })
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
