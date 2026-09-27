import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/analytics/track'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { hasAnalyzedCategory } from '@/lib/analytics/report-viewed-eligibility'
import { createPageViewGuard } from '@/lib/analytics/page-view-guard'
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent/types'
import type { CategorySummaryStatus } from '@/lib/category-engine/types'

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

describe('report_viewed — analytics catalog', () => {
  it('is part of the allowed typed event catalog', () => {
    expect(ANALYTICS_EVENTS).toContain('report_viewed')
  })
})

describe('trackEvent("report_viewed") — dataLayer shape and consent gating', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pushes the minimal { event: "report_viewed" } shape with no parameters', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('report_viewed')
    expect(dataLayer).toEqual([{ event: 'report_viewed' }])
  })

  it('does NOT push when analytics consent has been denied', () => {
    const { dataLayer } = stubWindowWithConsent(false)
    trackEvent('report_viewed')
    expect(dataLayer).toHaveLength(0)
  })
})

describe('hasAnalyzedCategory — report_viewed eligibility (pure)', () => {
  it('returns false for an empty list (no categories at all)', () => {
    expect(hasAnalyzedCategory([])).toBe(false)
  })

  it('returns false when every category is not_analyzed — a brand-new, empty website', () => {
    const summaries: { status: CategorySummaryStatus }[] = [{ status: 'not_analyzed' }, { status: 'not_analyzed' }, { status: 'not_analyzed' }]
    expect(hasAnalyzedCategory(summaries)).toBe(false)
  })

  it('returns true when at least one category is analyzed, even with the other six not_analyzed', () => {
    const summaries: { status: CategorySummaryStatus }[] = [
      { status: 'analyzed' },
      { status: 'not_analyzed' },
      { status: 'not_analyzed' },
      { status: 'not_analyzed' },
      { status: 'not_analyzed' },
      { status: 'not_analyzed' },
      { status: 'not_analyzed' },
    ]
    expect(hasAnalyzedCategory(summaries)).toBe(true)
  })

  it('returns true when ALL categories are analyzed', () => {
    const summaries: { status: CategorySummaryStatus }[] = Array.from({ length: 7 }, () => ({ status: 'analyzed' as const }))
    expect(hasAnalyzedCategory(summaries)).toBe(true)
  })

  it('ignores overall/category score entirely — an analyzed category with a null score is still eligible (V1 legitimately allows a withheld overall score)', () => {
    const summaries: { status: CategorySummaryStatus; score: number | null }[] = [
      { status: 'analyzed', score: null },
      { status: 'not_analyzed', score: null },
    ]
    expect(hasAnalyzedCategory(summaries)).toBe(true)
  })
})

describe('report_viewed — per-mount view semantics (reusing the shared, unpersisted page-view guard)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a single mounted visit fires report_viewed exactly once, even if the effect body runs again for the SAME mount (StrictMode double-invoke, or an unrelated rerender re-executing the same effect instance)', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    const guard = createPageViewGuard()

    if (guard.shouldFire()) trackEvent('report_viewed')
    if (guard.shouldFire()) trackEvent('report_viewed')
    if (guard.shouldFire()) trackEvent('report_viewed')

    expect(dataLayer).toEqual([{ event: 'report_viewed' }])
  })

  it('a genuine new visit (leaving and returning, or a refresh) is a fresh mount with a fresh guard, and may fire again', () => {
    const { dataLayer } = stubWindowWithConsent(true)

    const firstVisitGuard = createPageViewGuard()
    if (firstVisitGuard.shouldFire()) trackEvent('report_viewed')

    const secondVisitGuard = createPageViewGuard()
    if (secondVisitGuard.shouldFire()) trackEvent('report_viewed')

    expect(dataLayer).toEqual([{ event: 'report_viewed' }, { event: 'report_viewed' }])
  })

  it('unlike scan lifecycle events, this guard is never persisted to localStorage — it is a pure in-memory, per-mount latch', () => {
    // No localStorage interaction is exercised at all by createPageViewGuard
    // — asserted here by using it with NO window/localStorage stub present
    // and confirming it still works, proving it has no storage dependency.
    const guard = createPageViewGuard()
    expect(guard.shouldFire()).toBe(true)
    expect(guard.shouldFire()).toBe(false)
  })
})

describe('report_viewed — conditional mounting represents eligibility (no separate enable/disable logic needed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('an ineligible report (no analyzed categories) never even attempts to fire, because eligibility gates whether the tracker is rendered at all', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    const summaries: { status: CategorySummaryStatus }[] = [{ status: 'not_analyzed' }]

    // Mirrors app/dashboard/websites/[id]/page.tsx's own
    // `{hasAnalyzedPillar && <TrackPageView eventName="report_viewed" />}`
    // conditional — when ineligible, the component (and therefore its
    // effect/guard) is never mounted, so nothing can fire.
    if (hasAnalyzedCategory(summaries)) {
      const guard = createPageViewGuard()
      if (guard.shouldFire()) trackEvent('report_viewed')
    }

    expect(dataLayer).toHaveLength(0)
  })

  it('an eligible report fires exactly once for that mount', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    const summaries: { status: CategorySummaryStatus }[] = [{ status: 'analyzed' }]

    if (hasAnalyzedCategory(summaries)) {
      const guard = createPageViewGuard()
      if (guard.shouldFire()) trackEvent('report_viewed')
    }

    expect(dataLayer).toEqual([{ event: 'report_viewed' }])
  })
})
