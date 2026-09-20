import { describe, expect, it } from 'vitest'
import { reconcileCadenceWithEntitlements } from '@/lib/monitoring/entitlement-reconciliation'
import { resolveEntitlements, type SubscriptionRecord } from '@/lib/entitlements/subscription'

const activeBloomRow: SubscriptionRecord = { plan_key: 'bloom', status: 'active', current_period_end: null, trial_end: null }
const activeBloomProRow: SubscriptionRecord = { plan_key: 'bloom_pro', status: 'active', current_period_end: null, trial_end: null }

describe('reconcileCadenceWithEntitlements — Sprint 2, Prompt 2', () => {
  it('FREE CANNOT KEEP MONITORING: a downgraded-to-Free account is fully disabled, not merely slowed down', () => {
    const entitlements = resolveEntitlements(null)
    expect(reconcileCadenceWithEntitlements('weekly', entitlements)).toEqual({ action: 'disable' })
  })

  it('DOWNGRADE BEHAVIOR: a stored daily cadence on a plan that only grants weekly is clamped down, never silently kept at daily', () => {
    const entitlements = resolveEntitlements(activeBloomRow)
    expect(reconcileCadenceWithEntitlements('daily', entitlements)).toEqual({ action: 'downgrade', cadence: 'weekly' })
  })

  it('PAID ALLOWED CADENCE WORKS: a stored cadence within the plan grant is kept unchanged', () => {
    const entitlements = resolveEntitlements(activeBloomRow)
    expect(reconcileCadenceWithEntitlements('weekly', entitlements)).toEqual({ action: 'keep', cadence: 'weekly' })
  })

  it('a plan that grants daily lets a stored weekly preference stay weekly — never force-upgraded to the plan maximum', () => {
    const entitlements = resolveEntitlements(activeBloomProRow)
    expect(reconcileCadenceWithEntitlements('weekly', entitlements)).toEqual({ action: 'keep', cadence: 'weekly' })
  })

  it('a plan that grants daily keeps a stored daily preference', () => {
    const entitlements = resolveEntitlements(activeBloomProRow)
    expect(reconcileCadenceWithEntitlements('daily', entitlements)).toEqual({ action: 'keep', cadence: 'daily' })
  })

  it('a lapsed paid subscription is disabled exactly like Free, via the same evaluateMonitoringEnable path', () => {
    const lapsed = resolveEntitlements({ ...activeBloomRow, status: 'canceled' })
    expect(reconcileCadenceWithEntitlements('weekly', lapsed)).toEqual({ action: 'disable' })
  })

  it("defensive: a stored 'none' cadence on an enabled row is treated as a data inconsistency and disabled, never crashes", () => {
    const entitlements = resolveEntitlements(activeBloomProRow)
    expect(reconcileCadenceWithEntitlements('none', entitlements)).toEqual({ action: 'disable' })
  })
})
