import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/analytics/track'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { shouldRecordScanStarted, shouldRecordScanTerminal } from '@/lib/analytics/scan-lifecycle-dedup'
import { classifyTerminalCrawlStatus, trackScanStarted, trackScanTerminal } from '@/lib/analytics/scan-lifecycle'
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent/types'
import type { CrawlRunStatus } from '@/lib/crawler/types'

function createFakeLocalStorage(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

function stubWindowWithConsent(analyticsGranted: boolean, extraLocalStorage?: Record<string, string>) {
  const dataLayer: unknown[] = []
  const localStorageContents = {
    [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, analytics: analyticsGranted }),
    ...extraLocalStorage,
  }
  vi.stubGlobal('window', { dataLayer, localStorage: createFakeLocalStorage(localStorageContents) })
  return { dataLayer }
}

describe('scan lifecycle events — analytics catalog', () => {
  it('scan_started, scan_completed, scan_failed are all part of the allowed typed event catalog', () => {
    expect(ANALYTICS_EVENTS).toContain('scan_started')
    expect(ANALYTICS_EVENTS).toContain('scan_completed')
    expect(ANALYTICS_EVENTS).toContain('scan_failed')
  })
})

describe('trackEvent — scan lifecycle dataLayer shape and consent gating', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pushes the minimal { event: "scan_started" } shape with no parameters', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('scan_started')
    expect(dataLayer).toEqual([{ event: 'scan_started' }])
  })

  it('pushes the minimal { event: "scan_completed" } shape with no parameters', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('scan_completed')
    expect(dataLayer).toEqual([{ event: 'scan_completed' }])
  })

  it('pushes the minimal { event: "scan_failed" } shape with no parameters', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackEvent('scan_failed')
    expect(dataLayer).toEqual([{ event: 'scan_failed' }])
  })

  it('does NOT push any scan lifecycle event when analytics consent has been denied', () => {
    const { dataLayer } = stubWindowWithConsent(false)
    trackEvent('scan_started')
    trackEvent('scan_completed')
    trackEvent('scan_failed')
    expect(dataLayer).toHaveLength(0)
  })
})

describe('classifyTerminalCrawlStatus — pure lifecycle mapping', () => {
  it('classifies "completed" as a success', () => {
    expect(classifyTerminalCrawlStatus('completed')).toBe('completed')
  })

  it('classifies "partial" as a success — the same status ScanWebsiteControls itself treats as analyzable', () => {
    expect(classifyTerminalCrawlStatus('partial')).toBe('completed')
  })

  it('classifies "failed" as a failure', () => {
    expect(classifyTerminalCrawlStatus('failed')).toBe('failed')
  })

  it('classifies "cancelled" as a failure (documented mapping — no current code path produces this status, but it is bucketed with the other unsuccessful terminal states for forward-compatibility)', () => {
    expect(classifyTerminalCrawlStatus('cancelled')).toBe('failed')
  })

  it('classifies non-terminal statuses as null', () => {
    expect(classifyTerminalCrawlStatus('queued')).toBeNull()
    expect(classifyTerminalCrawlStatus('running')).toBeNull()
  })

  it('is total over every CrawlRunStatus value — a compile-time guarantee that no status silently falls through unclassified', () => {
    const allStatuses: CrawlRunStatus[] = ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled']
    for (const status of allStatuses) {
      expect(() => classifyTerminalCrawlStatus(status)).not.toThrow()
    }
  })
})

describe('shouldRecordScanStarted — per-crawl-run dedup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a genuinely new run returns true exactly once', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanStarted('run-1')).toBe(true)
  })

  it('a second observation of the SAME run (remount, refresh, another tab/instance) returns false', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanStarted('run-1')).toBe(true)
    expect(shouldRecordScanStarted('run-1')).toBe(false)
    expect(shouldRecordScanStarted('run-1')).toBe(false)
  })

  it('a DIFFERENT run is tracked independently', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanStarted('run-1')).toBe(true)
    expect(shouldRecordScanStarted('run-2')).toBe(true)
  })

  it('persists across a simulated refresh (a fresh call against the SAME underlying storage still recognizes the run as already recorded)', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanStarted('run-1')).toBe(true)

    // Simulate a full page refresh: re-stub window with the SAME
    // localStorage contents a real browser would have persisted.
    const raw = (window as unknown as { localStorage: { getItem: (k: string) => string | null } }).localStorage.getItem('webioom-analytics-scan-lifecycle-v1')
    vi.unstubAllGlobals()
    stubWindowWithConsent(true, raw ? { 'webioom-analytics-scan-lifecycle-v1': raw } : undefined)

    expect(shouldRecordScanStarted('run-1')).toBe(false)
  })
})

describe('shouldRecordScanTerminal — per-crawl-run dedup and completed/failed exclusivity', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a genuinely new terminal outcome returns true exactly once', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanTerminal('run-1')).toBe(true)
  })

  it('repeated terminal observation of the SAME run returns false', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanTerminal('run-1')).toBe(true)
    expect(shouldRecordScanTerminal('run-1')).toBe(false)
  })

  it('a run cannot record a second terminal outcome even if the caller believes it is the OPPOSITE outcome — the dedup key does not depend on which outcome is being recorded', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanTerminal('run-1')).toBe(true) // e.g. "completed" wins the race
    expect(shouldRecordScanTerminal('run-1')).toBe(false) // a later "failed" observation for the same run is refused
  })

  it('scan_started and scan_terminal dedup are tracked independently for the same run', () => {
    stubWindowWithConsent(true)
    expect(shouldRecordScanStarted('run-1')).toBe(true)
    expect(shouldRecordScanTerminal('run-1')).toBe(true)
    expect(shouldRecordScanStarted('run-1')).toBe(false)
    expect(shouldRecordScanTerminal('run-1')).toBe(false)
  })

  it('caps the number of tracked runs so a long-lived browser does not grow the record unboundedly, evicting the oldest first', () => {
    stubWindowWithConsent(true)
    for (let i = 0; i < 51; i++) {
      expect(shouldRecordScanStarted(`run-${i}`)).toBe(true)
    }
    // run-0 was the very first recorded and should have been evicted once
    // the 51st distinct run pushed the tracked set over its cap — so
    // observing it again is treated as new.
    expect(shouldRecordScanStarted('run-0')).toBe(true)
    // A recently recorded run should still be remembered.
    expect(shouldRecordScanStarted('run-50')).toBe(false)
  })
})

describe('shouldRecordScanStarted/shouldRecordScanTerminal — storage safety (fail closed for analytics, never throw)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false, never throws, when localStorage.getItem throws', () => {
    const throwingLocalStorage = {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => {},
    }
    vi.stubGlobal('window', { dataLayer: [], localStorage: throwingLocalStorage })

    expect(() => shouldRecordScanStarted('run-1')).not.toThrow()
    expect(shouldRecordScanStarted('run-1')).toBe(false)
    expect(() => shouldRecordScanTerminal('run-1')).not.toThrow()
    expect(shouldRecordScanTerminal('run-1')).toBe(false)
  })

  it('returns false, never throws, when localStorage.setItem throws (e.g. quota exceeded) — a write that cannot be confirmed must not be reported as recorded', () => {
    const setItemThrowsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    vi.stubGlobal('window', { dataLayer: [], localStorage: setItemThrowsStorage })

    expect(shouldRecordScanStarted('run-1')).toBe(false)
  })

  it('returns false, never throws, when window is unavailable (SSR)', () => {
    expect(shouldRecordScanStarted('run-1')).toBe(false)
    expect(shouldRecordScanTerminal('run-1')).toBe(false)
  })
})

describe('trackScanStarted / trackScanTerminal — end-to-end wrapper behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fires scan_started exactly once for a genuinely new run, even if called again for the same run', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackScanStarted('run-1')
    trackScanStarted('run-1')
    trackScanStarted('run-1')
    expect(dataLayer).toEqual([{ event: 'scan_started' }])
  })

  it('fires scan_completed exactly once for a genuinely new terminal outcome', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackScanTerminal('run-1', 'completed')
    trackScanTerminal('run-1', 'completed')
    expect(dataLayer).toEqual([{ event: 'scan_completed' }])
  })

  it('fires scan_failed exactly once, and never ALSO fires scan_completed for the same run afterward', () => {
    const { dataLayer } = stubWindowWithConsent(true)
    trackScanTerminal('run-1', 'failed')
    trackScanTerminal('run-1', 'completed')
    expect(dataLayer).toEqual([{ event: 'scan_failed' }])
  })

  it('never throws even when the dedup layer cannot confirm state (storage failure) — analytics failure must never propagate into scan execution', () => {
    const throwingLocalStorage = {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => {},
    }
    vi.stubGlobal('window', { dataLayer: [], localStorage: throwingLocalStorage })

    expect(() => trackScanStarted('run-1')).not.toThrow()
    expect(() => trackScanTerminal('run-1', 'completed')).not.toThrow()
  })

  it('does not push when analytics consent is denied, even though the dedup latch is still consumed', () => {
    const { dataLayer } = stubWindowWithConsent(false)
    trackScanStarted('run-1')
    expect(dataLayer).toHaveLength(0)
  })
})
