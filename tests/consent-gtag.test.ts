import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consentValuesFor, updateGoogleConsent } from '@/lib/consent/gtag'

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

describe('updateGoogleConsent', () => {
  let dataLayer: unknown[]

  beforeEach(() => {
    dataLayer = []
    vi.stubGlobal('window', { dataLayer })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pushes a real-time consent "update" command (not "default") with the correct shape for an accepted choice', () => {
    updateGoogleConsent(true)
    expect(dataLayer).toEqual([['consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]])
  })

  it('pushes a denied update for a rejected choice', () => {
    updateGoogleConsent(false)
    expect(dataLayer).toEqual([['consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]])
  })

  it('creates window.dataLayer if it does not already exist, rather than overwriting an existing array GTM may have already populated', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('window', {})
    updateGoogleConsent(true)
    expect((window as unknown as { dataLayer: unknown[] }).dataLayer).toEqual([
      ['consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('does nothing (never throws) when window is unavailable (SSR)', () => {
    vi.unstubAllGlobals()
    expect(() => updateGoogleConsent(true)).not.toThrow()
  })
})
