import type { PageGraph } from './graph'

/**
 * Phase 27 — precomputed, shared context every architecture check
 * receives, mirroring lib/technical-seo/context.ts's own AnalyzerContext
 * pattern.
 */
export type AnalyzerContext = {
  graph: PageGraph
  /** Pages this analysis actually evaluated (crawl_pages.status === 'completed') — the denominator severity.ts's spread calculation uses. */
  totalAnalyzedPages: number
  /**
   * True when the underlying crawl_run.status is 'partial' — i.e. the
   * crawl stopped at a page-budget boundary before exhausting its own
   * frontier. Checks whose conclusions depend on having seen the WHOLE
   * reachable link graph (orphan pages, underlinked pages) MUST consult
   * this flag and suppress or degrade themselves accordingly — see
   * docs/site-architecture-engine.md's "Partial crawl behavior" section
   * for exactly which checks are safe under a partial crawl and which are
   * not.
   */
  isPartialCrawl: boolean
}
