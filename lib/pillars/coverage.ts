import type { CrawlPageRow } from '@/lib/crawler/types'
import { isEligibleContentPage } from '@/lib/category-engine/eligibility'

/**
 * Evidence-aware health scoring (2026-09-22) — shared by Performance/
 * Accessibility/Security (the same generic engine, lib/pillars/run-analysis.ts).
 * Simpler than On-Page/Architecture's own coverage: none of these three
 * pillars has a "comparison" style check that needs 2+ pages to be
 * meaningful (every check here — missing alt text, a missing security
 * header, an oversized page — is independently meaningful even from a
 * single eligible page), so there is no distinct 'low' tier here: either
 * there was at least one real page to check (`'adequate'`) or there was
 * none at all (`'none'`).
 */
export type PillarCoverageLevel = 'none' | 'adequate'

export type PillarCoverage = {
  eligiblePageCount: number
  totalAnalyzedPages: number
  level: PillarCoverageLevel
}

export function computePillarCoverage(pages: CrawlPageRow[], totalAnalyzedPages: number): PillarCoverage {
  const eligiblePageCount = pages.filter(isEligibleContentPage).length
  return { eligiblePageCount, totalAnalyzedPages, level: eligiblePageCount === 0 ? 'none' : 'adequate' }
}
