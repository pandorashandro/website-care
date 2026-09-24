import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStoredConsent, writeStoredConsent, shouldShowConsentBanner } from '@/lib/consent/storage'
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent/types'

/**
 * Cookie Consent V1 — this project's test suite deliberately runs in plain
 * Node, never jsdom (see vitest.config.ts's own doc comment), so `window`
 * does not exist by default. `vi.stubGlobal` provides a minimal fake
 * `window.localStorage` for exactly these tests — the smallest mechanism
 * that lets storage.ts's own `typeof window === 'undefined'` guard take the
 * "real browser" branch, without adding a jsdom dependency this codebase
 * has explicitly avoided.
 */
function createFakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    _store: store,
  }
}

let fakeLocalStorage: ReturnType<typeof createFakeLocalStorage>

describe('consent storage', () => {
  beforeEach(() => {
    fakeLocalStorage = createFakeLocalStorage()
    vi.stubGlobal('window', { localStorage: fakeLocalStorage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when nothing has been stored', () => {
    expect(readStoredConsent()).toBeNull()
  })

  it('round-trips a granted analytics choice', () => {
    writeStoredConsent(true)
    expect(readStoredConsent()).toEqual({ version: CONSENT_VERSION, analytics: true })
  })

  it('round-trips a denied analytics choice', () => {
    writeStoredConsent(false)
    expect(readStoredConsent()).toEqual({ version: CONSENT_VERSION, analytics: false })
  })

  it('treats a record from an older/different consent version as absent — the banner should show again rather than reinterpret an old choice', () => {
    fakeLocalStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: 0, analytics: true }))
    expect(readStoredConsent()).toBeNull()
  })

  it('treats corrupted/unparsable stored JSON as absent rather than throwing', () => {
    fakeLocalStorage.setItem(CONSENT_STORAGE_KEY, '{not valid json')
    expect(() => readStoredConsent()).not.toThrow()
    expect(readStoredConsent()).toBeNull()
  })

  it('never stores anything beyond version and the analytics boolean', () => {
    writeStoredConsent(true)
    const raw = fakeLocalStorage.getItem(CONSENT_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(Object.keys(parsed).sort()).toEqual(['analytics', 'version'])
  })

  it('returns null when window is unavailable (SSR)', () => {
    vi.unstubAllGlobals()
    expect(readStoredConsent()).toBeNull()
    expect(() => writeStoredConsent(true)).not.toThrow()
  })
})

describe('shouldShowConsentBanner', () => {
  it('NEW VISITOR — no saved consent — shows the banner', () => {
    expect(shouldShowConsentBanner(null)).toBe(true)
  })

  it('RETURNING ACCEPTED VISITOR — saved consent respected — banner not shown again', () => {
    expect(shouldShowConsentBanner({ version: CONSENT_VERSION, analytics: true })).toBe(false)
  })

  it('RETURNING REJECTED VISITOR — saved consent respected — banner not shown again', () => {
    expect(shouldShowConsentBanner({ version: CONSENT_VERSION, analytics: false })).toBe(false)
  })
})

describe('CHANGE PREFERENCE — persistence across a full write/read cycle', () => {
  beforeEach(() => {
    fakeLocalStorage = createFakeLocalStorage()
    vi.stubGlobal('window', { localStorage: fakeLocalStorage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Analytics Off -> On persists the new choice and the banner logic reflects it', () => {
    writeStoredConsent(false)
    expect(shouldShowConsentBanner(readStoredConsent())).toBe(false)
    expect(readStoredConsent()?.analytics).toBe(false)

    writeStoredConsent(true)
    expect(readStoredConsent()?.analytics).toBe(true)
  })

  it('Analytics On -> Off persists the new choice', () => {
    writeStoredConsent(true)
    expect(readStoredConsent()?.analytics).toBe(true)

    writeStoredConsent(false)
    expect(readStoredConsent()?.analytics).toBe(false)
  })
})
