import type { CrawlEvidence } from '@/lib/crawler/evidence'
import { outboundCount } from '../graph'
import { isArchitectureEligiblePage } from '../eligibility'
import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 27, Checkpoint C.6 — dead-end pages (no outgoing internal links).
 *
 * Deliberately LOW severity and LOW confidence, classified 'monitor' (see
 * actionability.ts) — a dead end is very often entirely intentional (a
 * "thank you" page, a printable page, a standalone legal document, a
 * contact page whose only purpose is a form) rather than a structural
 * defect. This check surfaces the observation without implying every
 * instance is a problem.
 *
 * A page's own outgoing links are extracted from its own fetched HTML
 * regardless of whether the crawl overall was partial — this check is NOT
 * suppressed on a partial crawl (unlike orphan/underlinked, which depend on
 * having seen the WHOLE reachable graph, this only depends on the page's
 * own content, which is always fully known once the page itself was
 * fetched).
 *
 * Real-world evidence-quality pass: requires isArchitectureEligiblePage
 * (see eligibility.ts) rather than just "completed + HTML" — a WordPress
 * mega-menu widget endpoint (`?wpr_mega_menu=...`) or similar
 * template/utility resource that happens to fetch as 200 HTML with no
 * further links is not a "dead end" in any meaningful navigational sense;
 * it was never a destination a visitor was meant to browse to.
 */
export function analyzeDeadEnds(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const deadEndPages = evidence.pages.filter((page) => isArchitectureEligiblePage(page) && outboundCount(context.graph, page.url) === 0)

  if (deadEndPages.length === 0) return []

  return [
    {
      checkKey: 'dead_end_page',
      category: 'dead_ends',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'low',
      title: 'Pages have no outgoing internal links',
      explanation: `${deadEndPages.length} page${deadEndPages.length === 1 ? '' : 's'} webioom crawled ${deadEndPages.length === 1 ? 'has' : 'have'} no internal links to any other page on your site.`,
      whyItMatters: 'A page with no outgoing links is a dead end for visitors browsing your site — though this is often intentional (e.g. a thank-you or confirmation page), so it is worth a quick manual review rather than automatic action.',
      recommendation: 'Review these pages — if a dead end is unintentional, consider adding a link back to relevant content (e.g. related articles, categories, or your main navigation).',
      evidence: {},
      affectedPages: deadEndPages.map((page) => ({
        url: page.url,
        currentState: { label: 'Outgoing internal links', value: '0' },
        desiredState: null,
        detail: {},
      })),
    },
  ]
}
