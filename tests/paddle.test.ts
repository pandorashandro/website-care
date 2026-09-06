import { describe, it, expect } from 'vitest'
import { resolvePaddlePriceId, derivePlanFromPriceId, isPaddlePlanKey, type PaddlePriceMapping } from '@/lib/paddle/plan-mapping'
import { verifyPaddleWebhookSignature } from '@/lib/paddle/webhook-signature'
import {
  parsePaddleSubscriptionEventData,
  mapPaddleStatus,
  mapPaddleSubscriptionEvent,
  reconcileSubscriptionSnapshot,
  type PaddleSubscriptionEventData,
} from '@/lib/paddle/event-mapping'
import { createHmac } from 'node:crypto'

/**
 * Phase 23.2 — permanent regression coverage for the Paddle billing
 * backend. Everything here is pure (plan-mapping.ts, webhook-signature.ts,
 * event-mapping.ts take plain data in and return plain data out) or uses
 * only synthetic secrets/payloads — no live Paddle account, no network
 * call, and no Supabase client is required, matching this phase's
 * explicit "no live Paddle account required for permanent tests"
 * instruction. The DB-touching layer (lib/paddle/subscription-sync.ts,
 * which calls the apply_paddle_subscription_event /
 * apply_paddle_subscription_reconciliation Postgres functions added by
 * this phase's unapplied migration) and the live HTTP calls in
 * lib/paddle/client.ts are intentionally not unit tested here — the same
 * precedent already established for lib/integrations/wix/client.ts and
 * lib/integrations/shopify/client.ts, neither of which is unit tested with
 * a mocked fetch either. Their correctness is covered by the pure logic
 * they wrap, by code review, and ultimately by live sandbox testing (see
 * docs/paddle-billing.md's live-testing checklist).
 *
 * Specifically NOT covered here, because they require a live Postgres
 * harness this suite deliberately does not fake: same-event_id duplicate
 * detection, strictly-older/-newer occurred_at ordering, and "equal
 * occurred_at + same event_id resolves as duplicate before ordering is
 * even considered" — all three are properties of
 * apply_paddle_subscription_event's SQL body (see the migration file and
 * its own extensive comments), verified by direct reading/code review,
 * not simulated with a fake database here. What IS covered here is the
 * one piece of the equal-occurred_at-different-event path that is pure
 * TypeScript: reconcileSubscriptionSnapshot's decision logic (below).
 */

const mapping: PaddlePriceMapping = { bloom: 'pri_bloom_configured', bloom_pro: 'pri_bloom_pro_configured' }

describe('plan/price mapping (A-F)', () => {
  it('A: free has no Paddle price — there is no PaddlePlanKey value for it at all', () => {
    // resolvePaddlePriceId's own parameter type (PaddlePlanKey = 'bloom' |
    // 'bloom_pro') makes calling it with 'free' a compile error — this is
    // the actual guarantee, not a runtime branch to exercise. This test
    // instead confirms the mapping object itself never carries a 'free'
    // entry that could be reached by any means.
    expect(Object.keys(mapping)).toEqual(['bloom', 'bloom_pro'])
  })

  it('B: Bloom resolves only to the configured Bloom price', () => {
    expect(resolvePaddlePriceId('bloom', mapping)).toBe('pri_bloom_configured')
    expect(resolvePaddlePriceId('bloom', mapping)).not.toBe(mapping.bloom_pro)
  })

  it('C: Bloom Pro resolves only to the configured Bloom Pro price', () => {
    expect(resolvePaddlePriceId('bloom_pro', mapping)).toBe('pri_bloom_pro_configured')
    expect(resolvePaddlePriceId('bloom_pro', mapping)).not.toBe(mapping.bloom)
  })

  it('D: an unconfigured plan fails closed to null, never a guessed price', () => {
    const unconfigured: PaddlePriceMapping = { bloom: null, bloom_pro: 'pri_bloom_pro_configured' }
    expect(resolvePaddlePriceId('bloom', unconfigured)).toBeNull()
  })

  it('E: an unknown price ID grants no paid plan', () => {
    expect(derivePlanFromPriceId('pri_never_configured', mapping)).toBeNull()
    expect(derivePlanFromPriceId('', mapping)).toBeNull()
  })

  it('F: only "bloom"/"bloom_pro" are ever accepted as a browser-submitted plan key', () => {
    expect(isPaddlePlanKey('bloom')).toBe(true)
    expect(isPaddlePlanKey('bloom_pro')).toBe(true)
    expect(isPaddlePlanKey('free')).toBe(false)
    expect(isPaddlePlanKey('enterprise')).toBe(false)
    expect(isPaddlePlanKey('pri_bloom_configured')).toBe(false) // a price ID itself is never a valid plan key
  })
})

const WEBHOOK_SECRET = 'ntfset_test_secret_value_1234567890'

function signPayload(rawBody: string, tsSeconds: number, secret: string = WEBHOOK_SECRET): string {
  const hex = createHmac('sha256', secret).update(`${tsSeconds}:${rawBody}`, 'utf8').digest('hex')
  return `ts=${tsSeconds};h1=${hex}`
}

describe('webhook signature verification (G)', () => {
  const rawBody = JSON.stringify({ event_type: 'subscription.activated' })

  it('accepts a validly-signed, fresh request', () => {
    const now = Date.now()
    const header = signPayload(rawBody, Math.floor(now / 1000))
    expect(verifyPaddleWebhookSignature(rawBody, header, WEBHOOK_SECRET, now)).toEqual({ ok: true })
  })

  it('G: rejects a missing signature header', () => {
    expect(verifyPaddleWebhookSignature(rawBody, null, WEBHOOK_SECRET)).toEqual({ ok: false, reason: 'missing_header' })
  })

  it('G: rejects a malformed signature header', () => {
    expect(verifyPaddleWebhookSignature(rawBody, 'not-a-valid-header', WEBHOOK_SECRET)).toEqual({
      ok: false,
      reason: 'malformed_header',
    })
  })

  it('rejects a malformed (non-numeric) timestamp in an otherwise well-formed header', () => {
    expect(verifyPaddleWebhookSignature(rawBody, 'ts=not-a-number;h1=abcdef0123456789', WEBHOOK_SECRET)).toEqual({
      ok: false,
      reason: 'malformed_header',
    })
  })

  it('G: rejects a wrong-secret signature (tampered or forged body)', () => {
    const now = Date.now()
    const header = signPayload(rawBody, Math.floor(now / 1000), 'a-different-secret-entirely')
    expect(verifyPaddleWebhookSignature(rawBody, header, WEBHOOK_SECRET, now)).toEqual({ ok: false, reason: 'signature_mismatch' })
  })

  it('G: rejects a signature computed over a different body than the one delivered', () => {
    const now = Date.now()
    const header = signPayload(JSON.stringify({ event_type: 'subscription.canceled' }), Math.floor(now / 1000))
    expect(verifyPaddleWebhookSignature(rawBody, header, WEBHOOK_SECRET, now)).toEqual({ ok: false, reason: 'signature_mismatch' })
  })

  it('G: rejects a validly-signed but stale (replayed) timestamp, one hour old', () => {
    const now = Date.now()
    const oldTs = Math.floor((now - 60 * 60 * 1000) / 1000) // one hour old
    const header = signPayload(rawBody, oldTs)
    expect(verifyPaddleWebhookSignature(rawBody, header, WEBHOOK_SECRET, now)).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' })
  })

  it('accepts a timestamp exactly at the 5-second tolerance boundary', () => {
    // `now` is deliberately a clean whole-second millisecond value here
    // (not Date.now(), which carries a sub-second fraction) so the
    // computed gap to `boundaryTs` is exactly 5000ms, not "5000ms plus
    // whatever fraction of the current second had already elapsed" —
    // otherwise this boundary test would be flaky.
    const now = Math.floor(Date.now() / 1000) * 1000
    const boundaryTs = now / 1000 - 5
    const header = signPayload(rawBody, boundaryTs)
    expect(verifyPaddleWebhookSignature(rawBody, header, WEBHOOK_SECRET, now)).toEqual({ ok: true })
  })

  it('rejects a timestamp just past the 5-second tolerance — this is the exact regression this correction fixes: an earlier draft widened this to 5 minutes, which this test would have wrongly accepted', () => {
    const now = Math.floor(Date.now() / 1000) * 1000
    const justPastBoundaryTs = now / 1000 - 6
    const header = signPayload(rawBody, justPastBoundaryTs)
    expect(verifyPaddleWebhookSignature(rawBody, header, WEBHOOK_SECRET, now)).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' })
  })

  it('rejects a timestamp 5 minutes old — the tolerance this codebase previously (incorrectly) used, now confirmed rejected', () => {
    const now = Date.now()
    const fiveMinutesOldTs = Math.floor((now - 5 * 60 * 1000) / 1000)
    const header = signPayload(rawBody, fiveMinutesOldTs)
    expect(verifyPaddleWebhookSignature(rawBody, header, WEBHOOK_SECRET, now)).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' })
  })
})

describe('malformed body rejected (H)', () => {
  it('H: rejects a non-object payload', () => {
    expect(parsePaddleSubscriptionEventData(null)).toBeNull()
    expect(parsePaddleSubscriptionEventData('a string')).toBeNull()
    expect(parsePaddleSubscriptionEventData(42)).toBeNull()
  })

  it('H: rejects an object missing required fields', () => {
    expect(parsePaddleSubscriptionEventData({})).toBeNull()
    expect(parsePaddleSubscriptionEventData({ id: 'sub_1' })).toBeNull()
    expect(parsePaddleSubscriptionEventData({ id: 'sub_1', customer_id: 'ctm_1', status: 'active' })).toBeNull() // missing items
  })

  it('accepts a well-formed subscription payload and tolerates unrelated extra fields', () => {
    const parsed = parsePaddleSubscriptionEventData({
      id: 'sub_1',
      customer_id: 'ctm_1',
      status: 'active',
      items: [{ price: { id: 'pri_bloom_configured' } }],
      current_billing_period: { starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-02-01T00:00:00Z' },
      custom_data: { webioom_user_id: 'user-1' },
      some_field_this_module_does_not_know_about: 'ignored',
    })
    expect(parsed).toMatchObject({ id: 'sub_1', customer_id: 'ctm_1', status: 'active' })
  })
})

function subscriptionData(overrides: Partial<PaddleSubscriptionEventData>): PaddleSubscriptionEventData {
  return {
    id: 'sub_1',
    customer_id: 'ctm_1',
    status: 'active',
    items: [{ price: { id: 'pri_bloom_configured' } }],
    current_billing_period: { ends_at: '2026-02-01T00:00:00Z' },
    custom_data: { webioom_user_id: 'user-1' },
    ...overrides,
  }
}

describe('event mapping and plan derivation (I-P)', () => {
  it('I: a valid active event maps to Bloom, active', () => {
    const result = mapPaddleSubscriptionEvent(subscriptionData({}), mapping)
    expect(result).toEqual({
      ok: true,
      userId: 'user-1',
      update: {
        planKey: 'bloom',
        status: 'active',
        providerCustomerId: 'ctm_1',
        providerSubscriptionId: 'sub_1',
        currentPeriodEnd: '2026-02-01T00:00:00Z',
        trialEnd: null,
      },
    })
  })

  it('J: a valid event on the Bloom Pro price maps to Bloom Pro', () => {
    const result = mapPaddleSubscriptionEvent(subscriptionData({ items: [{ price: { id: 'pri_bloom_pro_configured' } }] }), mapping)
    expect(result.ok).toBe(true)
    expect(result.ok && result.update.planKey).toBe('bloom_pro')
  })

  it('K: trialing is mapped correctly, including the item-level trial end', () => {
    const result = mapPaddleSubscriptionEvent(
      subscriptionData({
        status: 'trialing',
        items: [{ price: { id: 'pri_bloom_configured' }, trial_dates: { ends_at: '2026-01-15T00:00:00Z' } }],
      }),
      mapping
    )
    expect(result.ok).toBe(true)
    expect(result.ok && result.update.status).toBe('trialing')
    expect(result.ok && result.update.trialEnd).toBe('2026-01-15T00:00:00Z')
  })

  it('L: past_due is mapped correctly', () => {
    const result = mapPaddleSubscriptionEvent(subscriptionData({ status: 'past_due' }), mapping)
    expect(result.ok).toBe(true)
    expect(result.ok && result.update.status).toBe('past_due')
  })

  it('M: paused is mapped correctly', () => {
    const result = mapPaddleSubscriptionEvent(subscriptionData({ status: 'paused' }), mapping)
    expect(result.ok).toBe(true)
    expect(result.ok && result.update.status).toBe('paused')
  })

  it('N: canceled is mapped correctly', () => {
    const result = mapPaddleSubscriptionEvent(subscriptionData({ status: 'canceled' }), mapping)
    expect(result.ok).toBe(true)
    expect(result.ok && result.update.status).toBe('canceled')
  })

  it('O: an unknown provider status fails closed', () => {
    expect(mapPaddleStatus('some_future_paddle_status')).toBeNull()
    const result = mapPaddleSubscriptionEvent(subscriptionData({ status: 'some_future_paddle_status' }), mapping)
    expect(result).toEqual({ ok: false, reason: 'unknown_status' })
  })

  it('unknown price grants no paid plan, even with an otherwise valid event', () => {
    const result = mapPaddleSubscriptionEvent(subscriptionData({ items: [{ price: { id: 'pri_never_configured' } }] }), mapping)
    expect(result).toEqual({ ok: false, reason: 'unknown_price' })
  })

  it('an unconfigured plan is never silently granted as Bloom or any other plan', () => {
    // A price ID that is not configured for EITHER plan must never fall
    // back to the "closest" or "cheapest" plan.
    const partiallyConfigured: PaddlePriceMapping = { bloom: 'pri_bloom_configured', bloom_pro: null }
    const result = mapPaddleSubscriptionEvent(subscriptionData({ items: [{ price: { id: 'pri_bloom_pro_configured' } }] }), partiallyConfigured)
    expect(result).toEqual({ ok: false, reason: 'unknown_price' })
  })

  it('R: an event with no custom_data (or a non-string user id) cannot be mapped to any user', () => {
    expect(mapPaddleSubscriptionEvent(subscriptionData({ custom_data: null }), mapping)).toEqual({
      ok: false,
      reason: 'missing_user_id',
    })
    expect(mapPaddleSubscriptionEvent(subscriptionData({ custom_data: { webioom_user_id: 12345 } }), mapping)).toEqual({
      ok: false,
      reason: 'missing_user_id',
    })
    expect(mapPaddleSubscriptionEvent(subscriptionData({ custom_data: { some_other_key: 'user-1' } }), mapping)).toEqual({
      ok: false,
      reason: 'missing_user_id',
    })
  })

  it('P: provider customer/subscription IDs in the mapped update always come from the event data itself, never substituted', () => {
    const result = mapPaddleSubscriptionEvent(subscriptionData({ id: 'sub_specific', customer_id: 'ctm_specific' }), mapping)
    expect(result.ok).toBe(true)
    expect(result.ok && result.update.providerSubscriptionId).toBe('sub_specific')
    expect(result.ok && result.update.providerCustomerId).toBe('ctm_specific')
  })

  it('mapping the same event twice is deterministic (a necessary property for safe retry handling)', () => {
    const data = subscriptionData({})
    expect(mapPaddleSubscriptionEvent(data, mapping)).toEqual(mapPaddleSubscriptionEvent(data, mapping))
  })
})

function rawFetchedSubscription(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'sub_1',
    customer_id: 'ctm_1',
    status: 'active',
    items: [{ price: { id: 'pri_bloom_configured' } }],
    current_billing_period: { ends_at: '2026-02-01T00:00:00Z' },
    custom_data: { webioom_user_id: 'user-1' },
    ...overrides,
  }
}

describe('reconciliation decision core (equal occurred_at + different event_id path)', () => {
  it('applies a fetched snapshot that names the same user the caller already trusted', () => {
    const result = reconcileSubscriptionSnapshot(rawFetchedSubscription(), 'user-1', mapping)
    expect(result).toEqual({
      ok: true,
      update: {
        planKey: 'bloom',
        status: 'active',
        providerCustomerId: 'ctm_1',
        providerSubscriptionId: 'sub_1',
        currentPeriodEnd: '2026-02-01T00:00:00Z',
        trialEnd: null,
      },
    })
  })

  it('authoritative reconciliation cannot trust a fetched snapshot naming a different user — this is the exact "do not trust a single, uncorroborated source" guarantee', () => {
    const result = reconcileSubscriptionSnapshot(rawFetchedSubscription({ custom_data: { webioom_user_id: 'a-different-user' } }), 'user-1', mapping)
    expect(result).toEqual({ ok: false, reason: 'user_mismatch' })
  })

  it('fails closed when the fetched snapshot has no custom_data at all, even though the subscription id "matched" — reported as unmapped (no user id could be read at all), distinct from user_mismatch (a user id was read but did not match)', () => {
    const result = reconcileSubscriptionSnapshot(rawFetchedSubscription({ custom_data: null }), 'user-1', mapping)
    expect(result).toEqual({ ok: false, reason: 'unmapped' })
  })

  it('an unknown Paddle subscription status in the fetched snapshot fails closed', () => {
    const result = reconcileSubscriptionSnapshot(rawFetchedSubscription({ status: 'some_future_paddle_status' }), 'user-1', mapping)
    expect(result).toEqual({ ok: false, reason: 'unmapped' })
  })

  it('an unknown Paddle price in the fetched snapshot fails closed, never granting a default plan', () => {
    const result = reconcileSubscriptionSnapshot(rawFetchedSubscription({ items: [{ price: { id: 'pri_never_configured' } }] }), 'user-1', mapping)
    expect(result).toEqual({ ok: false, reason: 'unmapped' })
  })

  it('a malformed fetch response fails closed rather than throwing', () => {
    expect(reconcileSubscriptionSnapshot(null, 'user-1', mapping)).toEqual({ ok: false, reason: 'malformed_response' })
    expect(reconcileSubscriptionSnapshot({ id: 'sub_1' }, 'user-1', mapping)).toEqual({ ok: false, reason: 'malformed_response' })
  })
})
