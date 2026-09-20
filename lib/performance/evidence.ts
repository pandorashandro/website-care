import type { CrawlPageRow } from '@/lib/crawler/types'
import type { PerformanceEvidence } from '@/lib/crawler/pillar-extract'

const DEFAULTS: PerformanceEvidence = {
  scriptCount: 0,
  renderBlockingScriptCount: 0,
  stylesheetCount: 0,
  imagesMissingDimensionsCount: 0,
  imagesMissingLazyLoadingCount: 0,
  responseContentEncoding: null,
  responseCacheControl: null,
}

/** Typed accessor for `crawl_pages.performance_evidence` (persisted as untyped jsonb) — every Performance check reads through this rather than casting inline, and a page whose evidence is `{}` (a non-HTML/failed page, or one crawled before this column existed) safely reads as all-zero/null rather than throwing. */
export function readPerformanceEvidence(page: CrawlPageRow): PerformanceEvidence {
  const raw = page.performance_evidence as Partial<PerformanceEvidence> | null | undefined
  return { ...DEFAULTS, ...(raw ?? {}) }
}
