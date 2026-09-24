import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConsentScript } from '@/lib/consent/default-consent-script'
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent/types'

/**
 * Cookie Consent V1 — this is the exact string rendered via next/script's
 * `beforeInteractive` strategy in app/layout.tsx, so it must be verified
 * BEHAVIORALLY (actually executed), not merely checked for substrings —
 * a typo inside the string would otherwise pass a naive "contains X" test
 * while being silently broken in the real browser.
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

function runDefaultConsentScript(localStorageContents?: Record<string, string>): unknown[] {
  const fakeWindow: { dataLayer?: unknown[]; localStorage: ReturnType<typeof createFakeLocalStorage> } = {
    localStorage: createFakeLocalStorage(localStorageContents),
  }
  vi.stubGlobal('window', fakeWindow)
  new Function(buildDefaultConsentScript())()
  return fakeWindow.dataLayer ?? []
}

describe('buildDefaultConsentScript', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('NEW VISITOR — no stored consent — pushes a "default" command with every Google consent signal denied', () => {
    const pushed = runDefaultConsentScript()
    expect(pushed).toEqual([
      ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('RETURNING ACCEPTED VISITOR — a stored, current-version, analytics:true record — defaults analytics_storage to granted on this SAME page load, with advertising signals still denied', () => {
    const pushed = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: true }) })
    expect(pushed).toEqual([
      ['consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('RETURNING REJECTED VISITOR — a stored, current-version, analytics:false record — defaults everything denied', () => {
    const pushed = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: false }) })
    expect(pushed).toEqual([
      ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('a record from an older consent version is treated exactly like a new visitor — denied by default, never a stale "granted" carried forward', () => {
    const pushed = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: 0, analytics: true }) })
    expect(pushed).toEqual([
      ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('corrupted stored JSON never throws and falls back to fully denied', () => {
    expect(() => runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: '{not valid json' })).not.toThrow()
    const pushed = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: '{not valid json' })
    expect(pushed).toEqual([
      ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('never references the GA4 measurement ID or any gtag.js script — Consent Mode defaults are pushed to dataLayer alone, exactly as GTM itself expects', () => {
    const script = buildDefaultConsentScript()
    expect(script).not.toMatch(/G-[A-Z0-9]{6,}/)
    expect(script).not.toContain('gtag.js')
    expect(script).not.toContain('googletagmanager.com')
  })
})
