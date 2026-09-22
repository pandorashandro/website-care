export { describeMostCommonIneligibilityReason } from '@/lib/category-engine/site-access'

/**
 * Founder-reported bug (2026-09-22): a real customer's On-Page SEO report
 * showed "Health: 100", "Pages analyzed: 1", every metric at 0, and "No
 * on-page problems found" — for a crawl whose one and only fetched page
 * (the seed URL) came back HTTP 403 and noindex, i.e. was NOT actually an
 * eligible page at all (see lib/on-page/eligibility.ts's isOnPageEligiblePage
 * — a 403 fails isSuccessfulHtmlFetch outright). The real eligible-page
 * count was ZERO, not one, and every check trivially "passed" by iterating
 * an empty set — a vacuous truth, not a verified clean bill of health.
 *
 * This is the SAME "Health vs. Coverage" distinction lib/content/coverage.ts
 * already established for Content Intelligence (see that module's own doc
 * comment) — a perfect score computed from zero or one page of evidence is
 * not "comprehensively excellent," it's "nothing to check, or almost
 * nothing to check." On-Page's version is simpler than Content's (no
 * extraction-confidence or per-dimension concept exists here) but the same
 * shape: a small, honest, SEPARATE record persisted alongside health_score
 * (via crawl_analyses' existing generic, nullable `coverage` column — see
 * supabase/migrations/20261104000000_content_analysis_coverage.sql, which
 * was deliberately built generic and reusable by "any FUTURE category
 * engine" — no new migration needed) so the UI can tell "verified clean"
 * apart from "nothing could be verified" instead of collapsing both into
 * the same bare "100."
 *
 * `comparisonChecksAssessed` exists specifically for duplicate_title/
 * duplicate_meta_description (lib/on-page/checks/duplicate-title.ts,
 * duplicate-meta-description.ts): both REQUIRE at least 2 eligible pages to
 * possibly produce a finding (`pages.length >= 2` filter) — with 0 or 1
 * eligible pages, they return `[]` unconditionally, which is mathematically
 * correct but carries essentially no evidence about site-wide duplication.
 * The check functions themselves are correctly left unchanged (returning
 * `[]` for "cannot possibly find a duplicate" is the honest computational
 * fact) — this flag is what lets the UI avoid describing that guaranteed-
 * empty result as "0 duplicates, verified."
 */

export type OnPageCoverageLevel = 'none' | 'low' | 'adequate'

export type OnPageAnalysisCoverage = {
  /** Pages that actually passed isOnPageEligiblePage — the real population every check evaluated. */
  eligiblePageCount: number
  /** crawl_pages rows with status='completed', REGARDLESS of http_status/noindex/canonical — kept only for reference; never used to imply eligibility. */
  totalAnalyzedPages: number
  /** False whenever eligiblePageCount < 2 — duplicate_title/duplicate_meta_description cannot possibly have produced a finding, so their "0" is not evidence. */
  comparisonChecksAssessed: boolean
  /** 'none' = nothing could be analyzed at all (score is not meaningful); 'low' = exactly 1 eligible page (per-page checks are meaningful, comparison checks are not); 'adequate' = 2+ eligible pages. */
  level: OnPageCoverageLevel
}

export function computeOnPageCoverage(eligiblePageCount: number, totalAnalyzedPages: number): OnPageAnalysisCoverage {
  const level: OnPageCoverageLevel = eligiblePageCount === 0 ? 'none' : eligiblePageCount === 1 ? 'low' : 'adequate'
  return {
    eligiblePageCount,
    totalAnalyzedPages,
    comparisonChecksAssessed: eligiblePageCount >= 2,
    level,
  }
}
