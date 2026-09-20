'use server'

import { startWebsiteCrawl, continueWebsiteCrawl } from './crawl-actions'
import { analyzeCrawlRun as analyzeTechnicalSeoCrawlRun } from './technical-seo-actions'
import { analyzeOnPageCrawlRun } from './on-page-actions'
import { analyzeArchitectureCrawlRun } from './site-architecture-actions'
import { analyzeContentCrawlRun } from './content-actions'
import { analyzePerformanceCrawlRun } from './performance-actions'
import { analyzeAccessibilityCrawlRun } from './accessibility-actions'
import { analyzeSecurityCrawlRun } from './security-actions'
import { scanWebsite } from '@/app/dashboard/actions'
import { summarizeCategoryAnalysisOutcomes, type CanonicalCategoryKey, type CategoryAnalysisOutcome } from './scan-orchestration'
import type { CrawlRunRow } from '@/lib/crawler/types'
import type { BatchOutcome } from '@/lib/crawler/engine'

export type { CanonicalCategoryKey, CategoryAnalysisOutcome }

/**
 * Unified webioom engine — SCAN WEBSITE orchestration.
 *
 * This file is the ONE place that turns "the customer clicked Scan
 * Website" into the full product-contract pipeline: crawl the site ->
 * (once evidence is ready) analyze every canonical category -> Overview
 * shows the results. It does not reimplement any of that work — every
 * function below is a thin sequencing layer over the SAME existing,
 * already-tested, already-ownership-checked action functions each category
 * page's own controls already call:
 *
 *   - `startWebsiteCrawl`/`continueWebsiteCrawl` (crawl-actions.ts) — the
 *     exact same crawl engine Site Scan's own controls drive, including the
 *     same plan page-budget enforcement (`entitlements.maxCrawlPages`),
 *     the same at-most-one-active-crawl-per-website guarantee, and the same
 *     SSRF/robots/persistence-hardening behavior.
 *   - `analyzeTechnicalSeoCrawlRun`/`analyzeOnPageCrawlRun`/
 *     `analyzeArchitectureCrawlRun`/`analyzeContentCrawlRun` — the exact
 *     same four canonical category actions each dedicated category page
 *     already calls, each independently ownership-checked, each persisting
 *     through its own canonical `crawl_analyses`/findings tables. No
 *     parallel scoring logic exists anywhere in this file.
 *   - `scanWebsite` (app/dashboard/actions.ts) — the existing legacy
 *     single-page scanner, called here (not duplicated) because it is
 *     STILL the genuine, existing evidence source behind two things this
 *     phase must not break: the Safe-Fix-eligible issue list further down
 *     Overview, and the Accessibility/Performance category scores (see
 *     category-score-grid.tsx) — both real, if narrower-scoped, existing
 *     checks worth keeping rather than discarding. It runs CONCURRENTLY
 *     with the crawl (it does not depend on crawl_pages evidence at all),
 *     never gating the crawl-driven pipeline on its completion.
 *
 * WHY THIS IS SPLIT INTO START/CONTINUE/ANALYZE FUNCTIONS rather than one
 * long-running action: this codebase has no background worker (see
 * lib/crawler/engine.ts's own module doc comment) — a crawl is advanced by
 * repeated, bounded (~8s) invocations driven by the browser tab staying
 * open, exactly like Site Scan's own controls. `scan-website-controls.tsx`
 * is the client-side driver that calls these in sequence.
 */

export type StartUnifiedScanResult = { ok: true; crawlRun: CrawlRunRow; alreadyActive: boolean } | { ok: false; error: string }

/**
 * Starts (or resumes, if one is already active) the site-wide crawl, and
 * fires the legacy single-page scan concurrently (fire-and-forget — its own
 * result is never awaited here; Overview simply reflects whatever `scans`
 * row exists whenever it next renders). A fresh scan always means a fresh
 * crawl_run — `startWebsiteCrawl` already returns the SAME run instead of
 * duplicating one if the website has an active (queued/running) crawl,
 * exactly like Site Scan's "Scan Again" behavior.
 */
export async function startUnifiedScan(websiteId: string): Promise<StartUnifiedScanResult> {
  const legacyScanFormData = new FormData()
  legacyScanFormData.set('websiteId', websiteId)
  // Intentionally not awaited inline with the crawl start — a legacy scan
  // failure (e.g. the existing scan-frequency entitlement) must never block
  // or fail the new unified crawl pipeline. Its own errors are still
  // reported through the existing `scans` table if a customer visits it.
  void scanWebsite(null, legacyScanFormData).catch(() => {})

  const result = await startWebsiteCrawl(websiteId)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, crawlRun: result.crawlRun, alreadyActive: result.alreadyActive }
}

export type ContinueUnifiedScanResult = { ok: true; outcome: BatchOutcome } | { ok: false; error: string }

/** Advances the crawl by one bounded batch — a direct passthrough to the exact same `continueWebsiteCrawl` Site Scan's own controls call. */
export async function continueUnifiedScan(websiteId: string, crawlRunId: string): Promise<ContinueUnifiedScanResult> {
  return continueWebsiteCrawl(websiteId, crawlRunId)
}

export type RunCategoryAnalysesResult = { ok: true; results: CategoryAnalysisOutcome[] }

/**
 * Runs every canonical category analyzer (all SEVEN as of Prompt 2) over
 * ONE completed/partial crawl_run — the SAME `crawlRunId` for every one, so
 * every category's result always corresponds to the same site-wide crawl
 * generation, never a mix of runs. Each analyzer is independently isolated
 * (Promise.allSettled) — one category failing (e.g. a transient error)
 * never prevents the others from persisting their own successful results,
 * per this phase's own "failures in one analyzer should be represented
 * honestly without destroying successful category results" requirement.
 * Always resolves `ok: true` at the top level (there is no single "did the
 * scan succeed" verdict for seven independent analyses) — callers inspect
 * `results` for the honest per-category outcome.
 *
 * Content's analyzer includes an optional, bounded, fail-soft AI step (see
 * lib/content/checks/completeness-ai.ts's own wall-clock budget) — a slow
 * or timed-out AI pass affects only Content's own tail latency within this
 * Promise.allSettled batch, never the other six categories, which resolve
 * independently.
 */
export async function runCategoryAnalyses(websiteId: string, crawlRunId: string): Promise<RunCategoryAnalysesResult> {
  const categories: CanonicalCategoryKey[] = ['technical_seo', 'on_page_seo', 'site_architecture', 'content', 'performance', 'accessibility', 'security']
  const runners: (() => Promise<{ ok: boolean; error?: string }>)[] = [
    () => analyzeTechnicalSeoCrawlRun(websiteId, crawlRunId),
    () => analyzeOnPageCrawlRun(websiteId, crawlRunId),
    () => analyzeArchitectureCrawlRun(websiteId, crawlRunId),
    () => analyzeContentCrawlRun(websiteId, crawlRunId),
    () => analyzePerformanceCrawlRun(websiteId, crawlRunId),
    () => analyzeAccessibilityCrawlRun(websiteId, crawlRunId),
    () => analyzeSecurityCrawlRun(websiteId, crawlRunId),
  ]

  const settled = await Promise.allSettled(runners.map((run) => run()))

  return { ok: true, results: summarizeCategoryAnalysisOutcomes(categories, settled) }
}
