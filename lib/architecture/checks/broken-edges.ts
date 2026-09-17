import type { CrawlEvidence } from '@/lib/crawler/evidence'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 27, Checkpoint C.5 — internal links to broken destinations.
 *
 * CROSS-CATEGORY OWNERSHIP: mirrors redirect-edges.ts's own reasoning —
 * Technical SEO's `internal_link_to_broken_url` already covers this same
 * evidence for crawlability purposes; this check is Site Architecture's own
 * navigation-graph framing of the identical fact (an edge in the internal
 * link graph leads nowhere useful). See docs/site-architecture-engine.md.
 *
 * Never invents an intended replacement destination — if the correct
 * target cannot be determined from this crawl's own evidence, remediation
 * stays guided (a human decision), never a guessed URL.
 */
export function analyzeBrokenEdges(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const sourcePageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const instances: RawFindingPageEvidence[] = []

  for (const link of evidence.links) {
    if (link.link_type !== 'internal') continue
    const targetPage = context.graph.pages.get(link.target_url)
    if (!targetPage) continue

    const sourcePage = sourcePageById.get(link.source_page_id)
    if (!sourcePage) continue

    const isBroken =
      targetPage.status === 'failed' ||
      (targetPage.status === 'completed' && typeof targetPage.http_status === 'number' && (targetPage.http_status < 200 || targetPage.http_status >= 300))
    if (!isBroken) continue

    instances.push({
      url: sourcePage.url,
      affectedResourceUrl: link.target_url,
      currentState: {
        label: 'Internal link points to',
        value: `${link.target_url} (${targetPage.status === 'failed' ? 'could not be reached' : `HTTP ${targetPage.http_status}`})`,
      },
      desiredState: null,
      proposedChange: `Update or remove the internal link to ${link.target_url}, or fix/redirect that destination to a working page.`,
      remediationType: 'link_restructure',
      detail: { linksTo: link.target_url, targetHttpStatus: targetPage.http_status, targetFetchFailed: targetPage.status === 'failed' },
    })
  }

  if (instances.length === 0) return []

  const uniqueSources = new Set(instances.map((i) => i.url))
  const uniqueTargets = new Set(instances.map((i) => i.affectedResourceUrl))

  return [
    {
      checkKey: 'internal_link_to_broken_edge',
      category: 'internal_link_health',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Internal navigation links to broken destinations',
      explanation: `${instances.length} internal link occurrence${instances.length === 1 ? '' : 's'} across ${uniqueSources.size} page${uniqueSources.size === 1 ? '' : 's'} point${instances.length === 1 ? 's' : ''} at ${uniqueTargets.size} broken URL${uniqueTargets.size === 1 ? '' : 's'}.`,
      whyItMatters: 'A broken internal link is a dead end in your site\'s navigation graph — visitors following it hit an error instead of reaching useful content.',
      recommendation: 'Update or remove these links, or fix/redirect the broken destination to a relevant working page.',
      evidence: {},
      affectedPages: instances,
    },
  ]
}
