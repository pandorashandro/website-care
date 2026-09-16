import type { CrawlRunRow, CrawlPageRow, CrawlLinkRow } from '@/lib/crawler/types'

/**
 * Phase 26 — the read-only evidence bundle every analyzer receives. Built
 * ONCE per analysis run (see run-analysis.ts) and shared by every analyzer,
 * so a lookup like "which pages link to this URL" is computed a single time
 * rather than once per check — the N+1-avoidance this phase's self-review
 * checklist calls out.
 */
export type CrawlEvidence = {
  crawlRun: CrawlRunRow
  /** Every crawl_pages row for this crawl_run, regardless of status. */
  pages: CrawlPageRow[]
  /** Every crawl_links row for this crawl_run. */
  links: CrawlLinkRow[]
}

/** Only pages the crawler actually completed processing for — most checks care about outcomes, not queued/skipped-by-budget rows. */
export function completedPages(evidence: CrawlEvidence): CrawlPageRow[] {
  return evidence.pages.filter((page) => page.status === 'completed')
}

/** Only pages the crawler attempted and failed outright (no response obtained at all). */
export function failedPages(evidence: CrawlEvidence): CrawlPageRow[] {
  return evidence.pages.filter((page) => page.status === 'failed')
}

/** Looks up a crawl_pages row by its exact `url` within this crawl_run — the join key every cross-page check (canonical target, internal link target) uses. */
export function buildPageIndex(evidence: CrawlEvidence): Map<string, CrawlPageRow> {
  const index = new Map<string, CrawlPageRow>()
  for (const page of evidence.pages) {
    index.set(page.url, page)
  }
  return index
}

/** Distinct source pages linking to each target URL — an inbound-link count, used as this phase's sole, explicitly-approximate "how important does this page look" signal (Checkpoint 5's own MEDIUM-confidence example: "many internal pages link to it"). */
export function buildInboundLinkCounts(evidence: CrawlEvidence): Map<string, number> {
  const counts = new Map<string, number>()
  const seenPairs = new Set<string>()

  for (const link of evidence.links) {
    const pairKey = `${link.source_page_id}|${link.target_url}`
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    counts.set(link.target_url, (counts.get(link.target_url) ?? 0) + 1)
  }

  return counts
}

/**
 * The minimum distinct-inbound-internal-link count for a page to be treated
 * as "important" for MEDIUM-confidence checks like important_page_non_indexable
 * — deliberately a coarse, documented heuristic (not a real importance/
 * authority model, which belongs to a later phase), used only to decide
 * whether a non-indexable page is worth flagging as more than routine.
 */
export const IMPORTANT_PAGE_MIN_INBOUND_LINKS = 3

/** A page is treated as "important" if it's the crawl's own seed (depth 0) or has enough distinct inbound internal links — see IMPORTANT_PAGE_MIN_INBOUND_LINKS's own doc comment for why this is a heuristic, not a certainty. */
export function isImportantPage(page: CrawlPageRow, inboundLinkCounts: Map<string, number>): boolean {
  if (page.depth === 0) return true
  return (inboundLinkCounts.get(page.url) ?? 0) >= IMPORTANT_PAGE_MIN_INBOUND_LINKS
}
