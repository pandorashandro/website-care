import type { CrawlEvidence } from '@/lib/crawler/evidence'
import type { CrawlPageRow } from '@/lib/crawler/types'

/**
 * Phase 27 — reusable, deterministic internal-link graph primitives built
 * from Phase 25's persisted crawl_pages/crawl_links evidence. No new
 * crawler evidence, no re-fetching: the graph is derived fresh, in memory,
 * each time an analysis runs (mirroring Technical SEO's own
 * evidence.ts/context.ts pattern of "build shared lookups once per
 * analysis, share across every check").
 *
 * Deliberately kept separate from every check function — graph
 * construction and traversal are pure, independently testable concerns; a
 * check function should only ever ASK the graph a question
 * (inboundCount/outboundCount/etc.), never walk crawl_links itself.
 */
export type PageGraph = {
  /** Every crawl_pages row for this crawl_run, regardless of status, keyed by its own normalized `url`. */
  pages: Map<string, CrawlPageRow>
  /** Distinct internal-link SOURCE page URLs pointing AT a given target URL. */
  inboundBySource: Map<string, Set<string>>
  /** Distinct internal-link TARGET URLs a given source page URL points to. */
  outboundByTarget: Map<string, Set<string>>
  /** The crawl's own seed page URL (depth 0), if one exists in this evidence. */
  seedUrl: string | null
}

/**
 * Builds the graph from one crawl_run's persisted pages/links. Self-links
 * (a page linking to itself) are excluded from both inbound and outbound
 * sets — they carry no connectivity information and would otherwise
 * artificially inflate a page's own apparent inbound count. External links
 * (`link_type !== 'internal'`) are ignored entirely; this graph models only
 * the site's own internal navigation structure.
 */
export function buildPageGraph(evidence: CrawlEvidence): PageGraph {
  const pages = new Map<string, CrawlPageRow>()
  for (const page of evidence.pages) {
    pages.set(page.url, page)
  }

  const sourcePageById = new Map(evidence.pages.map((page) => [page.id, page]))

  const inboundBySource = new Map<string, Set<string>>()
  const outboundByTarget = new Map<string, Set<string>>()

  for (const link of evidence.links) {
    if (link.link_type !== 'internal') continue

    const sourcePage = sourcePageById.get(link.source_page_id)
    if (!sourcePage) continue

    const sourceUrl = sourcePage.url
    const targetUrl = link.target_url
    if (sourceUrl === targetUrl) continue

    const inbound = inboundBySource.get(targetUrl) ?? new Set<string>()
    inbound.add(sourceUrl)
    inboundBySource.set(targetUrl, inbound)

    const outbound = outboundByTarget.get(sourceUrl) ?? new Set<string>()
    outbound.add(targetUrl)
    outboundByTarget.set(sourceUrl, outbound)
  }

  const seedPage = evidence.pages.find((page) => page.depth === 0)

  return { pages, inboundBySource, outboundByTarget, seedUrl: seedPage?.url ?? null }
}

/** Distinct internal pages linking to `url`. */
export function inboundCount(graph: PageGraph, url: string): number {
  return graph.inboundBySource.get(url)?.size ?? 0
}

/** Distinct internal targets `url` links to. */
export function outboundCount(graph: PageGraph, url: string): number {
  return graph.outboundByTarget.get(url)?.size ?? 0
}

export function inboundSources(graph: PageGraph, url: string): string[] {
  return Array.from(graph.inboundBySource.get(url) ?? [])
}

export function outboundTargets(graph: PageGraph, url: string): string[] {
  return Array.from(graph.outboundByTarget.get(url) ?? [])
}

export function isHomepage(graph: PageGraph, url: string): boolean {
  return graph.seedUrl !== null && graph.seedUrl === url
}
