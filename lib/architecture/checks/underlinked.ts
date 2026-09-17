import type { CrawlEvidence } from '@/lib/crawler/evidence'
import { inboundCount, inboundSources, isHomepage } from '../graph'
import { isArchitectureEligiblePage } from '../eligibility'
import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 27, Checkpoint C.3 — underlinked pages.
 *
 * Deliberately narrower than "orphan" (zero inbound links, handled by
 * orphan.ts): this check flags pages with SOME but very FEW internal links
 * pointing to them (1-2 distinct linking pages) — real, reachable pages
 * that nonetheless receive unusually weak internal-link support compared
 * to a healthy site structure.
 *
 * Deliberately does NOT claim to know business importance. "This page has
 * very few internal links pointing to it" is what the evidence actually
 * supports; "this important page does not receive enough authority" would
 * claim knowledge webioom does not have — importance is business context
 * only the site owner has, not something inferred from link count alone.
 *
 * SUPPRESSED on a partial crawl for the same reason as orphan.ts: a
 * partial crawl systematically UNDERCOUNTS inbound links (some linking
 * page may not have been crawled yet), so every page would look more
 * underlinked than it truly is — exactly the false-positive risk a
 * partial-crawl-aware check must avoid.
 */
export const UNDERLINKED_MAX_INBOUND = 2

export function analyzeUnderlinkedPages(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  if (context.isPartialCrawl) return []

  const underlinkedPages = evidence.pages.filter((page) => {
    if (!isArchitectureEligiblePage(page)) return false
    if (isHomepage(context.graph, page.url)) return false
    const count = inboundCount(context.graph, page.url)
    return count >= 1 && count <= UNDERLINKED_MAX_INBOUND
  })

  if (underlinkedPages.length === 0) return []

  return [
    {
      checkKey: 'underlinked_page',
      category: 'link_distribution',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'medium',
      title: 'Pages have very few internal links pointing to them',
      explanation: `${underlinkedPages.length} page${underlinkedPages.length === 1 ? '' : 's'} webioom crawled ${underlinkedPages.length === 1 ? 'has' : 'have'} internal links from only 1-${UNDERLINKED_MAX_INBOUND} other pages on your site.`,
      whyItMatters: 'This page has very few internal links pointing to it — that can make it harder for visitors to discover through normal browsing and gives search engines a weaker navigational signal toward it. Whether this matters depends on how important this specific page is to your business, which webioom cannot determine on its own.',
      recommendation: 'If this page is meaningful to your business, consider adding a few more relevant internal links to it from related pages.',
      evidence: {},
      affectedPages: underlinkedPages.map((page) => {
        const sources = inboundSources(context.graph, page.url)
        return {
          url: page.url,
          currentState: { label: 'Internal links pointing to this page', value: String(sources.length) },
          desiredState: null,
          remediationType: 'link_restructure',
          detail: { incomingLinkCount: sources.length, uniqueSourceCount: sources.length },
        }
      }),
    },
  ]
}
