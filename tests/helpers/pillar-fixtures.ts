import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import { isEligibleContentPage } from '@/lib/category-engine/eligibility'
import type { CrawlPageRow } from '@/lib/crawler/types'

/** Unified webioom engine, Prompt 2 — shared test-context builder for Performance/Accessibility/Security checks, mirroring tests/helpers/content-fixtures.ts's own precedent. */
export function pillarContextFor(pages: CrawlPageRow[], isPartialCrawl = false): PillarAnalyzerContext {
  return {
    eligiblePages: pages.filter(isEligibleContentPage),
    totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length,
    isPartialCrawl,
  }
}
