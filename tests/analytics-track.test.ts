import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/analytics/track'
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent/types'

/**
 * WEBIOOM Product Analytics — `trackEvent` tests.
 *
 * Mirrors the existing consent test convention (tests/consent-gtag.test.ts,
 * tests/consent-default-script.test.ts): a fake `window` is stubbed via
 * `vi.stubGlobal`, with a fake `localStorage` standing in for the SAME
 * consent record `lib/consent/storage.ts` reads — no separate consent
 * system is created or exercised here.
 */
function createFakeLocalStorage(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

function stubWindowWithConsent(analyticsGranted: boolean | null) {
  const dataLayer: unknown[] = []
  const localStorageContents: Record<string, string> =
    analyticsGranted === null ? {} : { [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: analyticsGranted }) }

  const fakeWindow = {
    dataLayer,
    localStorage: createFakeLocalStorage(localStorageContents),
  }
  vi.stubGlobal('window', fakeWindow)
  return { dataLayer, fakeWindow }
}

describe('trackEvent — consent gating', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does NOT push a custom event when analytics consent has not been granted (no stored consent at all)', () => {
    const { dataLayer } = stubWindowWithConsent(null)
    trackEvent('pricing_viewed')
    expect(dataLayer).toHaveLength(0)
  })

  it('does NOT push a custom event when the visitor explicitly rejected analytics', () => {
    const { dataLayer } = stubWindowWithConsent(false)
    trackEvent('sign_up', { method: 'email' })
    expect(dataLayer).toHaveLength(0)
  })

  it('DOES push a custom event once analytics consent has been granted', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('pricing_viewed')
    expect(dataLayer).toHaveLength(1)
  })

  it('does nothing and never throws when window is unavailable (SSR)', () => {
    expect(() => trackEvent('pricing_viewed')).not.toThrow()
  })
})

describe('trackEvent — event shape', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pushes a plain GTM custom-event object — { event, ...params } — not a gtag()-style command array', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('sign_up', { method: 'email' })
    expect(dataLayer[0]).toEqual({ event: 'sign_up', method: 'email' })
  })

  it('login pushes the GA4-recommended event name with method: email', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('login', { method: 'email' })
    expect(dataLayer[0]).toEqual({ event: 'login', method: 'email' })
  })

  it('pricing_viewed pushes with no parameters beyond the event name itself', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('pricing_viewed')
    expect(dataLayer[0]).toEqual({ event: 'pricing_viewed' })
  })

  it('creates window.dataLayer if it does not already exist, rather than overwriting one GTM may have already populated', () => {
    const localStorageContents = { [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: true }) }
    const freshWindow: { dataLayer?: unknown[]; localStorage: ReturnType<typeof createFakeLocalStorage> } = {
      localStorage: createFakeLocalStorage(localStorageContents),
    }
    vi.stubGlobal('window', freshWindow)

    trackEvent('pricing_viewed')

    expect(freshWindow.dataLayer).toBeDefined()
    expect(freshWindow.dataLayer).toHaveLength(1)
  })

  it('never throws even if dataLayer.push itself throws (e.g. a hostile/broken third-party override)', () => {
    const dataLayer = {
      push: () => {
        throw new Error('boom')
      },
    }
    const localStorageContents = { [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: true }) }
    vi.stubGlobal('window', { dataLayer, localStorage: createFakeLocalStorage(localStorageContents) })

    expect(() => trackEvent('pricing_viewed')).not.toThrow()
  })
})

describe('trackEvent — closed event catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects an event name outside the allowed catalog at runtime, even if TypeScript were bypassed', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    // Deliberately bypasses the type system to prove the runtime allow-list
    // (not just the compiler) refuses an arbitrary/unapproved event name.
    const untypedTrackEvent = trackEvent as (event: string) => void
    untypedTrackEvent('checkout_completed')
    expect(dataLayer).toHaveLength(0)
  })
})
