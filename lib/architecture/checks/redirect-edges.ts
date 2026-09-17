import type { CrawlEvidence } from '@/lib/crawler/evidence'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 27, Checkpoint C.4 — internal links pointing through redirects.
 *
 * CROSS-CATEGORY OWNERSHIP (see docs/site-architecture-engine.md): Technical
 * SEO's redirects.ts already detects this exact same underlying evidence
 * (an internal link whose target redirects) under its own checkKey
 * `internal_link_to_redirected_url`, framed around crawlability/ranking-
 * signal dilution for the TARGET resource. This check is deliberately NOT
 * a duplicate — it is the same fact viewed through Site Architecture's own
 * lens: the NAVIGATION GRAPH sends users/crawlers through an unnecessary
 * hop. Both checks' recommendations happen to agree (point the link
 * directly at the final destination), which is intentional — a coherent
 * recommendation from two angles, not a contradiction.
 *
 * One RawFindingPageEvidence instance is emitted per (source page, target
 * URL) EDGE — never deduplicated to "one row per target" — for the exact
 * reason Technical SEO's own redirects.ts documents: aggregate.ts's
 * affectedPageCount/occurrenceCount/uniqueTargetCount distinction only
 * comes out correct if every distinct edge is preserved going in.
 */
export function analyzeRedirectEdges(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const sourcePageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const instances: RawFindingPageEvidence[] = []

  for (const link of evidence.links) {
    if (link.link_type !== 'internal') continue
    const targetPage = context.graph.pages.get(link.target_url)
    if (!targetPage) continue

    const sourcePage = sourcePageById.get(link.source_page_id)
    if (!sourcePage) continue

    const wasRedirected = targetPage.status === 'completed' && !!targetPage.final_url && targetPage.final_url !== targetPage.url
    if (!wasRedirected) continue

    instances.push({
      url: sourcePage.url,
      affectedResourceUrl: link.target_url,
      currentState: { label: 'Internal link points to', value: `${link.target_url} (redirects, HTTP ${targetPage.http_status ?? 'unknown'})` },
      desiredState: { label: 'Recommended link target', value: targetPage.final_url },
      proposedChange: `Update the internal link on this page to point directly to ${targetPage.final_url} instead of ${link.target_url}.`,
      remediationType: 'link_restructure',
      detail: { linksTo: link.target_url, finalUrl: targetPage.final_url, targetHttpStatus: targetPage.http_status },
    })
  }

  if (instances.length === 0) return []

  const uniqueSources = new Set(instances.map((i) => i.url))
  const uniqueTargets = new Set(instances.map((i) => i.affectedResourceUrl))

  return [
    {
      checkKey: 'internal_link_to_redirect_edge',
      category: 'internal_link_health',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Internal navigation sends visitors through unnecessary redirects',
      explanation: `${instances.length} internal link occurrence${instances.length === 1 ? '' : 's'} across ${uniqueSources.size} page${uniqueSources.size === 1 ? '' : 's'} point${instances.length === 1 ? 's' : ''} at ${uniqueTargets.size} URL${uniqueTargets.size === 1 ? '' : 's'} that redirect elsewhere instead of loading directly.`,
      whyItMatters: 'Every redirect hop adds latency and an unnecessary step in your site\'s navigation graph — visitors and crawlers reach the intended page more slowly than necessary.',
      recommendation: 'Update these internal links to point directly at each destination\'s final URL, shortening the navigation path.',
      evidence: {},
      affectedPages: instances,
    },
  ]
}
