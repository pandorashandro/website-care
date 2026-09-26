import { describe, expect, it } from 'vitest'
import { createPageViewGuard } from '@/lib/analytics/page-view-guard'

/**
 * `components/analytics/track-page-view.tsx` holds one `createPageViewGuard()`
 * instance per component mount and consults it inside a mount-only
 * (`[]` dependency array) effect. This project's tests run in plain Node,
 * never jsdom (see vitest.config.ts), so the guard's core "only the first
 * call wins" behavior — the exact property that keeps `pricing_viewed` from
 * duplicating on an ordinary re-render (e.g. the monthly/yearly pricing
 * toggle) — is verified here directly, framework-independent of React.
 */
describe('createPageViewGuard', () => {
  it('allows the first call to fire', () => {
    const guard = createPageViewGuard()
    expect(guard.shouldFire()).toBe(true)
  })

  it('refuses every subsequent call on the same instance — simulating repeated effect invocations from ordinary rerenders/state changes', () => {
    const guard = createPageViewGuard()
    expect(guard.shouldFire()).toBe(true)
    expect(guard.shouldFire()).toBe(false)
    expect(guard.shouldFire()).toBe(false)
  })

  it('a fresh instance (a genuine new mount) is independent and may fire again', () => {
    const first = createPageViewGuard()
    first.shouldFire()

    const second = createPageViewGuard()
    expect(second.shouldFire()).toBe(true)
  })
})
