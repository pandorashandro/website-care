import type { CrawlEvidence } from '@/lib/crawler/evidence'
import { isArchitectureEligiblePage } from '../eligibility'
import type { RawFinding } from '../types'

/**
 * Phase 27, Checkpoint C.2 — deep pages.
 *
 * Threshold rationale (documented, not arbitrary): a typical small-to-
 * medium business site is home (depth 0) -> top-level section (depth 1) ->
 * subsection (depth 2) -> individual item/article (depth 3) — that is a
 * completely normal, healthy structure. Depth 4+ means a page requires
 * MORE hops than that baseline pattern to reach via the shortest path this
 * crawl actually discovered, which starts to indicate a navigation
 * structure that makes a page unnecessarily hard to reach by clicking
 * through the site.
 *
 * `crawl_pages.depth` is the crawler's own recorded discovery depth — a
 * directly observed fact about the shortest path THIS crawl found, not a
 * guess. One caveat, documented rather than silently ignored: a
 * sitemap-discovered page is always recorded at depth 1 regardless of its
 * true navigational depth (see lib/crawler/engine.ts's startCrawlRun,
 * which seeds all sitemap URLs at depth: 1) — so this check can only ever
 * UNDER-report deep pages that happen to also be in the sitemap, never
 * over-report them. That is the safe direction for a check whose explicit
 * mandate is to avoid false positives.
 *
 * Not sensitive to partial-crawl truncation: a page's OWN recorded depth
 * does not change based on whether OTHER, unrelated pages were crawled —
 * this check remains valid and is not suppressed on a partial crawl.
 *
 * Real-world evidence-quality pass: requires isArchitectureEligiblePage
 * (see eligibility.ts) — a deep PATH to a utility/template resource, or to
 * a page the site itself has marked noindex or a duplicate of another URL,
 * is not evidence of a navigation problem worth surfacing; this check
 * should only ever describe pages that meaningfully participate in
 * navigation, per this task's Part D.
 */
export const DEEP_PAGE_DEPTH_THRESHOLD = 4

export function analyzeDeepPages(evidence: CrawlEvidence): RawFinding[] {
  const deepPages = evidence.pages.filter(
    (page) => isArchitectureEligiblePage(page) && page.discovered_via !== 'sitemap' && page.depth >= DEEP_PAGE_DEPTH_THRESHOLD
  )

  if (deepPages.length === 0) return []

  return [
    {
      checkKey: 'deep_page',
      category: 'link_depth',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages require many clicks to reach from your homepage',
      explanation: `${deepPages.length} page${deepPages.length === 1 ? '' : 's'} webioom crawled ${deepPages.length === 1 ? 'is' : 'are'} at least ${DEEP_PAGE_DEPTH_THRESHOLD} internal-link hops away from your homepage along the shortest path found during this crawl.`,
      whyItMatters: 'Pages that are many clicks deep are harder for visitors to browse to and typically receive less internal-link support, which can make them harder for search engines to prioritize.',
      recommendation: 'Consider adding a more direct internal link to these pages from a higher-level page (e.g. a relevant category or hub page) to shorten the path to reach them.',
      evidence: {},
      affectedPages: deepPages.map((page) => ({
        url: page.url,
        currentState: { label: 'Observed crawl depth', value: `${page.depth} hops from homepage` },
        desiredState: null,
        remediationType: 'link_restructure',
        detail: { observedDepth: page.depth },
      })),
    },
  ]
}
