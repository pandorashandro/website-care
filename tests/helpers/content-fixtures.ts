import type { CrawlPageRow } from '@/lib/crawler/types'
import type { AnalyzerContext } from '@/lib/content/context'
import { isContentEligiblePage, getExtractionConfidence } from '@/lib/content/eligibility'
import { classifyPageType } from '@/lib/content/page-purpose'
import { hasLikelyAuxiliaryUrlSignal } from '@/lib/category-engine/eligibility'

/** Phase 29 test helper — builds a Content AnalyzerContext from raw pages, shared across every lib/content check test file rather than re-declared per file. */
export function contentContextFor(pages: CrawlPageRow[], isPartialCrawl = false): AnalyzerContext {
  return {
    eligiblePages: pages.filter(isContentEligiblePage).map((page) => ({
      page,
      pageType: classifyPageType(page, page.depth === 0),
      extractionConfidence: getExtractionConfidence(page),
      hasAuxiliaryUrlSignal: hasLikelyAuxiliaryUrlSignal(page),
    })),
    totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length,
    isPartialCrawl,
  }
}
