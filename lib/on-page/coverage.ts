import type { CrawlPageRow } from '@/lib/crawler/types'
import { eligibilityFailureReason, type EligibilityFailureReason } from '@/lib/category-engine/eligibility'

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

const INELIGIBILITY_REASON_LABEL: Record<EligibilityFailureReason, string> = {
  blocked_or_error_status: 'returned an error or non-success response when webioom tried to fetch it (this often means a firewall or bot-protection block)',
  non_html: "didn't return an HTML page webioom could read",
  noindex: 'was explicitly marked "noindex" by the page itself',
  cross_canonical: 'declared a different page as its canonical version',
  not_fetched: 'could not be reached during the crawl',
}

/**
 * Classifies every crawled page EXCLUDED from on-page analysis using
 * lib/category-engine/eligibility.ts's own eligibilityFailureReason (the
 * SAME logic that decided the page was ineligible in the first place, so
 * this can never disagree with the eligibility verdict), and returns a
 * plain-language description of the most common reason. Powers the "why
 * weren't more pages analyzed" caveat shown whenever coverage is 'none' or
 * 'low' (see the on-page-seo report page) — the exact evidence trail the
 * founder's own bug report asked for, rather than an unexplained low
 * number.
 */
export function describeMostCommonIneligibilityReason(pages: CrawlPageRow[]): string | null {
  const counts: Record<EligibilityFailureReason, number> = { blocked_or_error_status: 0, non_html: 0, noindex: 0, cross_canonical: 0, not_fetched: 0 }

  for (const page of pages) {
    const reason = eligibilityFailureReason(page)
    if (reason) counts[reason]++
  }

  const ranked = (Object.entries(counts) as [EligibilityFailureReason, number][]).sort((a, b) => b[1] - a[1])
  const [topReason, topCount] = ranked[0]
  if (topCount === 0) return null
  return INELIGIBILITY_REASON_LABEL[topReason]
}
