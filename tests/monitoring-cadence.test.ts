import { describe, expect, it } from 'vitest'
import { computeNextDueAt, CADENCE_INTERVAL_MS } from '@/lib/monitoring/cadence'

describe('computeNextDueAt', () => {
  it('DETERMINISTIC NEXT_DUE_AT: weekly cadence adds exactly 7 days', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    expect(computeNextDueAt('weekly', from)).toBe('2026-01-08T00:00:00.000Z')
  })

  it('DETERMINISTIC NEXT_DUE_AT: daily cadence adds exactly 1 day', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    expect(computeNextDueAt('daily', from)).toBe('2026-01-02T00:00:00.000Z')
  })

  it("cadence 'none' has no schedule at all — returns null, never a fabricated far-future date", () => {
    expect(computeNextDueAt('none', new Date('2026-01-01T00:00:00.000Z'))).toBeNull()
  })

  it('TIMEZONE-SAFE: computation is pure epoch-millisecond arithmetic, unaffected by any local timezone', () => {
    const from = new Date('2026-06-15T23:30:00.000Z')
    const expected = new Date(from.getTime() + CADENCE_INTERVAL_MS.daily).toISOString()
    expect(computeNextDueAt('daily', from)).toBe(expected)
  })

  it('changing cadence recomputes a different next_due_at from the SAME starting point', () => {
    const from = new Date('2026-03-01T00:00:00.000Z')
    const weekly = computeNextDueAt('weekly', from)
    const daily = computeNextDueAt('daily', from)
    expect(weekly).not.toBe(daily)
  })
})
