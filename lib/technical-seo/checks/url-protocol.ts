import type { CrawlEvidence } from '../evidence'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category G — URL/protocol health. Deliberately narrow: only the
 * one condition this crawl's evidence can support confidently (a site
 * crawled over HTTPS whose internal links reference an insecure http://
 * target) is implemented. Speculative duplicate-content/parameter-variant
 * analysis is explicitly out of scope for this phase — see the check
 * library's own "considered but not implemented" notes.
 */
export function analyzeUrlProtocol(evidence: CrawlEvidence): RawFinding[] {
  const findings: RawFinding[] = []

  const seedPage = evidence.pages.find((page) => page.depth === 0)
  if (!seedPage || !seedPage.url.startsWith('https:')) return findings // only meaningful for an HTTPS site

  const sourcePageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const targetsWithSources = new Map<string, Set<string>>()

  for (const link of evidence.links) {
    if (link.link_type !== 'internal') continue
    if (!link.target_url.startsWith('http:')) continue

    const sourcePage = sourcePageById.get(link.source_page_id)
    const sources = targetsWithSources.get(link.target_url) ?? new Set<string>()
    sources.add(sourcePage?.url ?? link.target_url)
    targetsWithSources.set(link.target_url, sources)
  }

  if (targetsWithSources.size === 0) return findings

  findings.push({
    checkKey: 'mixed_protocol_internal_links',
    category: 'url_protocol',
    scope: 'page',
    baseSeverity: 'low',
    confidence: 'high',
    title: 'HTTPS pages link internally to insecure HTTP URLs',
    explanation: `${targetsWithSources.size} internal link target${targetsWithSources.size === 1 ? '' : 's'} on your HTTPS site ${targetsWithSources.size === 1 ? 'uses' : 'use'} an insecure http:// URL instead of https://.`,
    whyItMatters: 'Mixed protocol links can trigger browser security warnings and send an inconsistent signal about which version of a URL is canonical.',
    recommendation: 'Update these internal links to use https:// instead of http://.',
    evidence: {},
    affectedPages: Array.from(targetsWithSources.entries()).map(([targetUrl, sources]) => ({
      url: Array.from(sources)[0],
      detail: { linksTo: targetUrl, fromPageCount: sources.size },
    })),
  })

  return findings
}
