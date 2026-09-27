/**
 * WEBIOOM Product Analytics — scan lifecycle client-side deduplication.
 *
 * WEBIOOM's crawler has no background worker (see lib/crawler/engine.ts's
 * own doc comment) — a crawl advances only via repeated, bounded calls
 * driven by a browser tab staying open, and `ScanWebsiteControls`
 * (app/dashboard/websites/[id]/scan-website-controls.tsx) auto-resumes an
 * already-active or already-completed-but-unanalyzed run on every mount.
 * That means the SAME crawl run can legitimately be observed by this
 * codebase's own analytics call sites more than once: a remount, a page
 * refresh, a second browser tab, or another `ScanWebsiteControls` instance
 * (e.g. the Dashboard's website card and that website's own Overview page
 * both render one) can all independently reach the exact point that would
 * otherwise call `trackScanStarted`/`trackScanTerminal` again for a run
 * this SAME browser has already reported.
 *
 * This module is the ONE place that decides "has THIS browser already
 * reported this crawl run's start / terminal outcome" — a tiny,
 * localStorage-backed latch keyed by crawl run ID (never pushed to
 * dataLayer; see lib/analytics/scan-lifecycle.ts, which is the only
 * consumer of this module). It intentionally does not attempt any
 * cross-browser or cross-device guarantee — see this module's own
 * `shouldRecordScanStarted`/`shouldRecordScanTerminal` doc comments and the
 * Phase 3 audit's documented limitation.
 *
 * FAIL-CLOSED FOR ANALYTICS, FAIL-OPEN FOR THE PRODUCT: every function here
 * only ever returns a boolean and never throws — a broken/unavailable
 * localStorage (private browsing, quota exceeded, a hostile override) must
 * never affect the scan itself. But when this module cannot confirm
 * (read OR persist) whether an event was already recorded, it returns
 * `false` ("do not fire") rather than `true` — the opposite of the usual
 * fail-open default — because returning `true` on an unreliable store risks
 * the worse outcome this module exists to prevent: an UNBOUNDED stream of
 * duplicate events every time the same call site is reached again (each
 * attempt would see no persisted record and think it's the first).
 * Occasionally under-reporting a genuine first event is an acceptable,
 * deliberately chosen tradeoff; unbounded duplication is not.
 */

const STORAGE_KEY = 'webioom-analytics-scan-lifecycle-v1'

/**
 * A generous but bounded cap on how many distinct crawl runs this browser
 * remembers, so a long-lived browser profile that scans the same websites
 * repeatedly over months does not grow this localStorage entry without
 * bound. Oldest entries (by insertion order) are dropped first — losing a
 * very old run's dedup record has no real consequence since that run's
 * lifecycle events (if any) were already reported long ago.
 */
const MAX_TRACKED_RUNS = 50

type ScanLifecycleRecord = { started: boolean; terminal: boolean }
type ScanLifecycleState = Record<string, ScanLifecycleRecord>

/** Returns the persisted state, or `null` if it could not be read/parsed at all (see module doc comment for why callers must treat `null` as "fail closed"). */
function readState(): ScanLifecycleState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return parsed as ScanLifecycleState
  } catch {
    return null
  }
}

/** Returns whether the write actually succeeded — see module doc comment for why callers must not report success unless this returns `true`. */
function writeState(state: ScanLifecycleState): boolean {
  if (typeof window === 'undefined') return false

  try {
    const keys = Object.keys(state)
    if (keys.length > MAX_TRACKED_RUNS) {
      for (const staleKey of keys.slice(0, keys.length - MAX_TRACKED_RUNS)) {
        delete state[staleKey]
      }
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/**
 * Returns `true` exactly once per crawl run ID (per browser) — the first
 * caller to ask is told "yes, record this," every subsequent caller (a
 * remount, a resumed run, another tab, a refresh) is told `false`. A
 * resumed already-active run must never reach this function with
 * `alreadyActive: false` in the first place (see
 * app/dashboard/websites/[id]/scan-website-controls.tsx's own call site),
 * but this latch is the second, storage-backed layer of protection against
 * duplication regardless.
 */
export function shouldRecordScanStarted(crawlRunId: string): boolean {
  const state = readState()
  if (state === null) return false
  if (state[crawlRunId]?.started) return false

  state[crawlRunId] = { started: true, terminal: state[crawlRunId]?.terminal ?? false }
  return writeState(state)
}

/**
 * Returns `true` exactly once per crawl run ID (per browser), for whichever
 * terminal outcome ('completed' or 'failed') is reported FIRST for that run
 * — every later call for the SAME run, even for the opposite outcome,
 * returns `false`. This is what guarantees a single crawl run can never
 * legitimately be reported as both scan_completed AND scan_failed: the
 * outcome value itself is not part of the stored key, only whether ANY
 * terminal outcome has already been recorded.
 */
export function shouldRecordScanTerminal(crawlRunId: string): boolean {
  const state = readState()
  if (state === null) return false
  if (state[crawlRunId]?.terminal) return false

  state[crawlRunId] = { started: state[crawlRunId]?.started ?? false, terminal: true }
  return writeState(state)
}
