import type { CrawlEvidence } from '@/lib/crawler/evidence'
import { inboundCount, isHomepage } from '../graph'
import { isArchitectureEligiblePage } from '../eligibility'
import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 27, Checkpoint C.1 — orphan / isolated pages.
 *
 * A page qualifies as an orphan only if: it is an architecture-eligible
 * page (see eligibility.ts — a real, successfully-fetched, indexable,
 * self-canonical content page, not a utility/template resource), it is NOT
 * the homepage/seed (the crawl's own starting point can never meaningfully
 * be "isolated" — it is where every other page's reachability is measured
 * FROM), and zero other crawled pages link to it internally.
 *
 * Given how lib/crawler/engine.ts discovers pages (a page is only ever
 * queued via 'seed', 'sitemap', or 'link' discovery — see
 * lib/crawler/types.ts's DiscoverySource), a page discovered via 'link' by
 * construction already has at least one recorded inbound edge (the very
 * link that discovered it), so it can never legitimately reach zero
 * inbound links here. In practice this check can only ever fire for
 * sitemap-discovered pages — real pages confirmed to exist by your own
 * sitemap, but with no internal navigation path leading to them. This is
 * documented, not assumed by branching logic, since a future crawler
 * change could in principle alter this invariant.
 *
 * SUPPRESSED ENTIRELY on a partial crawl: a partial crawl means the
 * frontier was cut off before exhausting itself, so a page's TRUE inbound
 * link count could be understated — some linking page may simply not have
 * been crawled yet. Claiming "orphan" under that condition would be
 * exactly the kind of irresponsible partial-crawl conclusion this phase's
 * acceptance criteria forbid. See docs/site-architecture-engine.md.
 */
export function analyzeOrphanPages(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  if (context.isPartialCrawl) return []

  const orphanPages = evidence.pages.filter(
    (page) => isArchitectureEligiblePage(page) && !isHomepage(context.graph, page.url) && inboundCount(context.graph, page.url) === 0
  )

  if (orphanPages.length === 0) return []

  return [
    {
      checkKey: 'orphan_page',
      category: 'orphan_pages',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages have no internal links pointing to them',
      explanation: `${orphanPages.length} page${orphanPages.length === 1 ? '' : 's'} webioom crawled ${orphanPages.length === 1 ? 'has' : 'have'} no internal links from any other crawled page pointing to ${orphanPages.length === 1 ? 'it' : 'them'}.`,
      whyItMatters: 'A page with no internal links is harder for visitors to find while browsing your site, and gives search engines no navigational path to discover it either.',
      recommendation: 'Add at least one relevant internal link to each of these pages from a related page on your site (e.g. a category page, related-content section, or your navigation menu).',
      evidence: {},
      affectedPages: orphanPages.map((page) => ({
        url: page.url,
        currentState: { label: 'Internal links pointing to this page', value: '0' },
        desiredState: { label: 'Internal links pointing to this page', value: 'At least 1' },
        remediationType: 'link_restructure',
        detail: { discoveredVia: page.discovered_via, crawlDepth: page.depth },
      })),
    },
  ]
}
