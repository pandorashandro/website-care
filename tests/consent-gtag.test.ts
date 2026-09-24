import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consentValuesFor, updateGoogleConsent } from '@/lib/consent/gtag'

/**
 * Google-standard command shape (2026-09-25 correction): `gtag()`'s own
 * documented stub (`function gtag(){dataLayer.push(arguments);}`) pushes
 * the function call's `arguments` object, not a plain Array — the two are
 * NOT `toEqual`-identical in Vitest (different prototype/constructor), even
 * though both are index-accessible with the same values. Every assertion
 * below normalizes what was actually pushed via `Array.from(...)` before
 * comparing, so the test verifies the real CONTENT Google's own gtag.js/GTM
 * would read (`item[0]`, `item[1]`, `item[2]`), not incidental object type.
 */
function normalizePushedCommand(pushedEntry: unknown): unknown[] {
  return Array.from(pushedEntry as ArrayLike<unknown>)
}

describe('consentValuesFor', () => {
  it('grants analytics_storage and keeps every advertising-related value denied when analytics is accepted', () => {
    expect(consentValuesFor(true)).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  })

  it('denies everything, including analytics_storage, when analytics is rejected', () => {
    expect(consentValuesFor(false)).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  })
})

describe('updateGoogleConsent — Google-standard gtag() command shape', () => {
  let dataLayer: unknown[]
  let fakeWindow: { dataLayer: unknown[]; gtag?: (...args: unknown[]) => void }

  beforeEach(() => {
    dataLayer = []
    fakeWindow = { dataLayer }
    vi.stubGlobal('window', fakeWindow)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defines window.gtag as a real callable function — the conventional global Google\'s own reference snippet always defines', () => {
    updateGoogleConsent(true)
    expect(typeof fakeWindow.gtag).toBe('function')
  })

  it('issues the update through window.gtag(\'consent\', \'update\', {...}) — the exact call shape Google documents, not a raw dataLayer.push(array)', () => {
    updateGoogleConsent(true)
    expect(dataLayer).toHaveLength(1)
    expect(normalizePushedCommand(dataLayer[0])).toEqual([
      'consent',
      'update',
      { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('pushes a real-time consent "update" command (not "default") with the correct shape for an accepted choice', () => {
    updateGoogleConsent(true)
    expect(normalizePushedCommand(dataLayer[0])).toEqual([
      'consent',
      'update',
      { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('pushes a denied update for a rejected choice', () => {
    updateGoogleConsent(false)
    expect(normalizePushedCommand(dataLayer[0])).toEqual([
      'consent',
      'update',
      { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('reuses an existing window.gtag rather than redefining it, if one is already present (e.g. already defined by the beforeInteractive default script)', () => {
    const existingCalls: unknown[][] = []
    const existingGtag = (...args: unknown[]) => {
      existingCalls.push(args)
    }
    vi.stubGlobal('window', { dataLayer, gtag: existingGtag })

    updateGoogleConsent(true)

    expect(existingCalls).toHaveLength(1)
    expect(existingCalls[0]).toEqual(['consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }])
    // The pre-existing gtag was used directly rather than pushing straight
    // to dataLayer a second, competing way.
    expect(dataLayer).toHaveLength(0)
  })

  it('creates window.dataLayer if it does not already exist, rather than overwriting an existing array GTM may have already populated', () => {
    vi.unstubAllGlobals()
    const freshWindow: { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } = {}
    vi.stubGlobal('window', freshWindow)

    updateGoogleConsent(true)

    expect(freshWindow.dataLayer).toBeDefined()
    expect(normalizePushedCommand((freshWindow.dataLayer as unknown[])[0])).toEqual([
      'consent',
      'update',
      { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('does nothing (never throws) when window is unavailable (SSR)', () => {
    vi.unstubAllGlobals()
    expect(() => updateGoogleConsent(true)).not.toThrow()
  })
})
