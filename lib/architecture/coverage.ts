import type { CrawlPageRow } from '@/lib/crawler/types'
import { isArchitectureEligiblePage } from './eligibility'

/**
 * Evidence-aware health scoring (2026-09-22) — mirrors lib/on-page/coverage.ts's
 * exact reasoning and level thresholds, applied to Site Architecture:
 * `isArchitectureEligiblePage` (2xx HTML, not noindex, self-canonical) is
 * the population every page-level check (orphan/underlinked/dead-end/
 * deep-page) evaluates. With 0 eligible pages there is no graph worth
 * reasoning about at all. With exactly 1, orphan/underlinked/dead-end
 * checks are structurally near-meaningless (a lone page trivially has 0
 * inbound links and 0 outbound links — that "finding" would be an artifact
 * of an incomplete crawl, not a real site-architecture defect) and the
 * site-wide `widespread_isolated_pages` check already requires ≥5 eligible
 * pages on its own (see checks/site-wide.ts's MIN_PAGES_FOR_PATTERN) to
 * even attempt a verdict.
 */

export type ArchitectureCoverageLevel = 'none' | 'low' | 'adequate'

export type ArchitectureCoverage = {
  eligiblePageCount: number
  totalAnalyzedPages: number
  /** False whenever eligiblePageCount < 2 — orphan/underlinked/dead-end findings from a single-page graph are not meaningful evidence of a real architecture defect. */
  graphChecksAssessed: boolean
  level: ArchitectureCoverageLevel
}

export function computeArchitectureCoverage(pages: CrawlPageRow[], totalAnalyzedPages: number): ArchitectureCoverage {
  const eligiblePageCount = pages.filter(isArchitectureEligiblePage).length
  const level: ArchitectureCoverageLevel = eligiblePageCount === 0 ? 'none' : eligiblePageCount === 1 ? 'low' : 'adequate'

  return {
    eligiblePageCount,
    totalAnalyzedPages,
    graphChecksAssessed: eligiblePageCount >= 2,
    level,
  }
}
