import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/analytics/track'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { readAndStripWebsiteAddedMarker } from '@/lib/analytics/consume-website-added-marker'
import { createPageViewGuard } from '@/lib/analytics/page-view-guard'
import { WEBSITE_ADDED_QUERY_PARAM, WEBSITE_ADDED_QUERY_VALUE } from '@/lib/analytics/website-added-marker'
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent/types'

function createFakeLocalStorage(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

function stubWindowWithConsent(analyticsGranted: boolean) {
  const dataLayer: unknown[] = []
  const localStorageContents = { [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: analyticsGranted }) }
  vi.stubGlobal('window', { dataLayer, localStorage: createFakeLocalStorage(localStorageContents) })
  return { dataLayer }
}

describe('website_added — analytics catalog', () => {
  it('is part of the allowed typed event catalog', () => {
    expect(ANALYTICS_EVENTS).toContain('website_added')
  })
})

describe('trackEvent("website_added") — dataLayer shape and consent gating', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pushes the correct GTM custom-event shape with no parameters', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('website_added')
    expect(dataLayer).toEqual([{ event: 'website_added' }])
  })

  it('does NOT push when analytics consent has been denied', () => {
    const { dataLayer } = stubWindowWithConsent(false)
    trackEvent('website_added')
    expect(dataLayer).toHaveLength(0)
  })
})

describe('readAndStripWebsiteAddedMarker — pure URL logic', () => {
  it('detects the marker and strips only that param, leaving the path bare when it was the only param', () => {
    const result = readAndStripWebsiteAddedMarker(`https://webioom.example/dashboard/websites/abc123?${WEBSITE_ADDED_QUERY_PARAM}=${WEBSITE_ADDED_QUERY_VALUE}`)
    expect(result.markerPresent).toBe(true)
    expect(result.cleanedUrl).toBe('/dashboard/websites/abc123')
  })

  it('preserves unrelated query parameters and only removes the marker', () => {
    const result = readAndStripWebsiteAddedMarker(
      `https://webioom.example/dashboard/websites/abc123?ref=email&${WEBSITE_ADDED_QUERY_PARAM}=${WEBSITE_ADDED_QUERY_VALUE}&utm_source=newsletter`
    )
    expect(result.markerPresent).toBe(true)
    expect(result.cleanedUrl).toBe('/dashboard/websites/abc123?ref=email&utm_source=newsletter')
  })

  it('preserves an existing hash fragment', () => {
    const result = readAndStripWebsiteAddedMarker(`https://webioom.example/dashboard/websites/abc123?${WEBSITE_ADDED_QUERY_PARAM}=${WEBSITE_ADDED_QUERY_VALUE}#activity`)
    expect(result.cleanedUrl).toBe('/dashboard/websites/abc123#activity')
  })

  it('reports no marker present when visiting a website page directly with no marker at all', () => {
    const result = readAndStripWebsiteAddedMarker('https://webioom.example/dashboard/websites/abc123')
    expect(result.markerPresent).toBe(false)
    expect(result.cleanedUrl).toBe('/dashboard/websites/abc123')
  })

  it('reports no marker present, and leaves other params untouched, when the marker key is absent but other params exist', () => {
    const result = readAndStripWebsiteAddedMarker('https://webioom.example/dashboard/websites/abc123?tab=history')
    expect(result.markerPresent).toBe(false)
    expect(result.cleanedUrl).toBe('/dashboard/websites/abc123?tab=history')
  })

  it('does not treat an incorrect marker value as present', () => {
    const result = readAndStripWebsiteAddedMarker(`https://webioom.example/dashboard/websites/abc123?${WEBSITE_ADDED_QUERY_PARAM}=0`)
    expect(result.markerPresent).toBe(false)
  })
})

/**
 * End-to-end (still Node-only, no DOM) simulation of
 * components/analytics/track-website-added.tsx's own effect body: reads the
 * marker, consults a fresh createPageViewGuard() the same way the
 * component's useRef-held guard would across repeated invocations of the
 * SAME mount's effect (StrictMode double-invoke, or any other reason the
 * effect body might run more than once for one real mount), and asserts it
 * fires exactly once even though the marker string itself never changes.
 */
describe('website_added marker consumption — end-to-end guard behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function consumeOnce(dataLayer: unknown[], guard: ReturnType<typeof createPageViewGuard>, href: string) {
    const { markerPresent } = readAndStripWebsiteAddedMarker(href)
    if (!markerPresent) return
    if (!guard.shouldFire()) return
    trackEvent('website_added')
  }

  it('a successful marker consumption fires website_added exactly once', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    const guard = createPageViewGuard()
    const href = `https://webioom.example/dashboard/websites/abc123?${WEBSITE_ADDED_QUERY_PARAM}=${WEBSITE_ADDED_QUERY_VALUE}`

    consumeOnce(dataLayer, guard, href)

    expect(dataLayer).toEqual([{ event: 'website_added' }])
  })

  it('a rerender re-running the same effect body (same guard instance, same marker still in the address bar) does not duplicate the event', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    const guard = createPageViewGuard()
    const href = `https://webioom.example/dashboard/websites/abc123?${WEBSITE_ADDED_QUERY_PARAM}=${WEBSITE_ADDED_QUERY_VALUE}`

    consumeOnce(dataLayer, guard, href)
    consumeOnce(dataLayer, guard, href)
    consumeOnce(dataLayer, guard, href)

    expect(dataLayer).toHaveLength(1)
  })

  it('a refresh/revisit AFTER the marker has already been stripped from the URL (a fresh guard, from a fresh mount) does not fire again', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    const { cleanedUrl } = readAndStripWebsiteAddedMarker(`https://webioom.example/dashboard/websites/abc123?${WEBSITE_ADDED_QUERY_PARAM}=${WEBSITE_ADDED_QUERY_VALUE}`)

    // Simulates the real browser reload: a brand new mount (fresh guard)
    // navigating to the ALREADY-cleaned URL the previous mount left behind.
    const freshGuardAfterReload = createPageViewGuard()
    consumeOnce(dataLayer, freshGuardAfterReload, `https://webioom.example${cleanedUrl}`)

    expect(dataLayer).toHaveLength(0)
  })

  it('visiting an existing website directly (no marker ever present) never fires the event, even on a fresh guard', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    const guard = createPageViewGuard()

    consumeOnce(dataLayer, guard, 'https://webioom.example/dashboard/websites/abc123')

    expect(dataLayer).toHaveLength(0)
  })
})
