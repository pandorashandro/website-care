import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConsentScript } from '@/lib/consent/default-consent-script'
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent/types'

/**
 * Cookie Consent V1 — this is the exact string rendered via next/script's
 * `beforeInteractive` strategy in app/layout.tsx, so it must be verified
 * BEHAVIORALLY (actually executed), not merely checked for substrings —
 * a typo inside the string would otherwise pass a naive "contains X" test
 * while being silently broken in the real browser.
 *
 * Google-standard command shape (2026-09-25 correction): the script now
 * defines and calls through `window.gtag` (Google's own documented stub,
 * `function gtag(){dataLayer.push(arguments);}`), so what lands in
 * dataLayer is a real `arguments` object, not a plain Array — the two are
 * NOT `toEqual`-identical in Vitest even with identical index values.
 * `normalizePushedCommand` converts what was actually pushed into a plain
 * array before asserting, so these tests verify the real CONTENT
 * (`item[0]`, `item[1]`, `item[2]`) GTM itself reads, not incidental object
 * type.
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

type FakeConsentWindow = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; localStorage: ReturnType<typeof createFakeLocalStorage> }

function normalizePushedCommand(pushedEntry: unknown): unknown[] {
  return Array.from(pushedEntry as ArrayLike<unknown>)
}

function runDefaultConsentScript(localStorageContents?: Record<string, string>): { pushed: unknown[]; fakeWindow: FakeConsentWindow } {
  const fakeWindow: FakeConsentWindow = {
    localStorage: createFakeLocalStorage(localStorageContents),
  }
  vi.stubGlobal('window', fakeWindow)
  new Function(buildDefaultConsentScript())()
  return { pushed: fakeWindow.dataLayer ?? [], fakeWindow }
}

describe('buildDefaultConsentScript', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('NEW VISITOR — no stored consent — pushes a "default" command with every Google consent signal denied', () => {
    const { pushed } = runDefaultConsentScript()
    expect(pushed).toHaveLength(1)
    expect(normalizePushedCommand(pushed[0])).toEqual([
      'consent',
      'default',
      { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('defines window.gtag as a real callable function — Google\'s own documented stub, not a bare dataLayer.push(array)', () => {
    const { fakeWindow } = runDefaultConsentScript()
    expect(typeof fakeWindow.gtag).toBe('function')
  })

  it('the pushed entry is a function-call arguments object (Google\'s exact gtag() shape), not a plain Array literal', () => {
    const { pushed } = runDefaultConsentScript()
    expect(Array.isArray(pushed[0])).toBe(false)
    // Still index/length-accessible exactly like an Array — this is what GTM's own dataLayer processing actually reads.
    expect((pushed[0] as ArrayLike<unknown>).length).toBe(3)
    expect((pushed[0] as ArrayLike<unknown>)[0]).toBe('consent')
  })

  it('RETURNING ACCEPTED VISITOR — a stored, current-version, analytics:true record — defaults analytics_storage to granted on this SAME page load, with advertising signals still denied', () => {
    const { pushed } = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: true }) })
    expect(normalizePushedCommand(pushed[0])).toEqual([
      'consent',
      'default',
      { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('RETURNING REJECTED VISITOR — a stored, current-version, analytics:false record — defaults everything denied', () => {
    const { pushed } = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: false }) })
    expect(normalizePushedCommand(pushed[0])).toEqual([
      'consent',
      'default',
      { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('a record from an older consent version is treated exactly like a new visitor — denied by default, never a stale "granted" carried forward', () => {
    const { pushed } = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: 0, analytics: true }) })
    expect(normalizePushedCommand(pushed[0])).toEqual([
      'consent',
      'default',
      { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('corrupted stored JSON never throws and falls back to fully denied', () => {
    expect(() => runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: '{not valid json' })).not.toThrow()
    const { pushed } = runDefaultConsentScript({ [CONSENT_STORAGE_KEY]: '{not valid json' })
    expect(normalizePushedCommand(pushed[0])).toEqual([
      'consent',
      'default',
      { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('never references the GA4 measurement ID or any gtag.js script — Consent Mode defaults are pushed to dataLayer alone, exactly as GTM itself expects', () => {
    const script = buildDefaultConsentScript()
    expect(script).not.toMatch(/G-[A-Z0-9]{6,}/)
    expect(script).not.toContain('gtag.js')
    expect(script).not.toContain('googletagmanager.com')
  })

  it('matches Google\'s own documented reference shape: defines dataLayer, defines a gtag() stub, then calls gtag(\'consent\', \'default\', {...})', () => {
    const script = buildDefaultConsentScript()
    expect(script).toContain('window.dataLayer = window.dataLayer || []')
    expect(script).toContain('function gtag()')
    expect(script).toContain("window.dataLayer.push(arguments)")
    expect(script).toContain("gtag('consent', 'default'")
  })
})
