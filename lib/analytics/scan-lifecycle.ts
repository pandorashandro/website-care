import type { CrawlRunStatus } from '@/lib/crawler/types'
import { trackEvent } from './track'
import { shouldRecordScanStarted, shouldRecordScanTerminal } from './scan-lifecycle-dedup'

export type ScanTerminalOutcome = 'completed' | 'failed'

/**
 * Maps the crawl engine's own terminal statuses (lib/crawler/engine.ts's
 * `TERMINAL_STATUSES`: 'completed' | 'partial' | 'failed' | 'cancelled') to
 * the two-way analytics outcome WEBIOOM reports.
 *
 * 'partial' is treated as a genuine success — it is the SAME status
 * `ScanWebsiteControls` itself already treats as analyzable (its own
 * `ANALYZABLE_STATUSES` set) and proceeds to run category analysis on,
 * exactly like a full 'completed' crawl.
 *
 * 'cancelled' is treated as a failure. As of this writing, no code path in
 * this codebase actually produces 'cancelled' (confirmed by inspection — it
 * exists only in the `CrawlRunStatus` type union, never written by
 * `lib/crawler/engine.ts` or any caller), but it is bucketed with 'failed'
 * for forward-compatibility rather than left unclassified, matching
 * `TERMINAL_STATUSES`' own grouping of every non-completed/partial terminal
 * state as unsuccessful.
 *
 * 'queued'/'running' are not terminal and return `null`. Callers only ever
 * classify a status once the crawl engine has reported `done: true`
 * (see `BatchOutcome`), so `null` is not expected in practice — this
 * function stays total over `CrawlRunStatus` rather than narrowing its
 * parameter type, so a future new status is a visible `null` rather than a
 * type error at every call site.
 */
export function classifyTerminalCrawlStatus(status: CrawlRunStatus): ScanTerminalOutcome | null {
  if (status === 'completed' || status === 'partial') return 'completed'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return null
}

/**
 * Reports `scan_started`. The ONLY call site
 * (app/dashboard/websites/[id]/scan-website-controls.tsx) gates this on
 * `started.ok === true && started.alreadyActive === false` — a genuinely
 * NEW crawl run, never a resumed one. Deduplicated per crawl run ID (see
 * scan-lifecycle-dedup.ts) so a remount, a refresh, or another tab/instance
 * observing the same run never reports a second `scan_started` for it.
 * Never throws — an analytics failure must never affect the scan itself.
 */
export function trackScanStarted(crawlRunId: string): void {
  try {
    if (!shouldRecordScanStarted(crawlRunId)) return
    trackEvent('scan_started')
  } catch {
    // Analytics must never affect scan execution.
  }
}

/**
 * Reports `scan_completed`/`scan_failed` for a crawl run's terminal
 * outcome. Deduplicated per crawl run ID AND mutually exclusive with its
 * own opposite outcome — `shouldRecordScanTerminal` only returns `true` for
 * the FIRST terminal outcome recorded for a given run, in either direction
 * — so one run can never legitimately report both `scan_completed` and
 * `scan_failed`. Never throws.
 */
export function trackScanTerminal(crawlRunId: string, outcome: ScanTerminalOutcome): void {
  try {
    if (!shouldRecordScanTerminal(crawlRunId)) return
    trackEvent(outcome === 'completed' ? 'scan_completed' : 'scan_failed')
  } catch {
    // Analytics must never affect scan execution.
  }
}
