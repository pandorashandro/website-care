import type { CrawlEvidence } from '../evidence'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 26B, Category D — redirects. Rewritten (Checkpoint 9) after
 * real-world validation showed the Phase 26A version conflating three
 * different numbers: it grouped by TARGET URL and reported only one
 * (arbitrary) source page per target, so "19 internal link occurrences
 * across 2 source pages, hitting 3 unique redirecting targets" rendered as
 * a single ambiguous "3 internal link targets" figure that didn't match
 * what the customer could see on the page.
 *
 * This version emits ONE RawFindingPageEvidence instance per (source page,
 * target URL) EDGE — never deduplicated to "one row per target" — so
 * aggregate.ts's affectedPageCount (distinct source pages) / occurrenceCount
 * (every distinct edge) / uniqueTargetCount (distinct targets) come out
 * correct by construction, and each instance carries the full
 * source -> current target -> final destination -> proposed replacement
 * chain as typed current/desired state, not just prose.
 *
 * Still joins crawl_links.target_url against AnalyzerContext.pageIndex
 * (this crawl's OWN discovered pages) rather than target_page_id, which
 * lib/crawler/engine.ts never populates (see lib/crawler/types.ts's own
 * comment) — a read-time join, not a change to how Phase 25 persists links.
 */
export function analyzeRedirects(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const findings: RawFinding[] = []

  const sourcePageById = new Map(evidence.pages.map((page) => [page.id, page]))

  const redirectedInstances: RawFindingPageEvidence[] = []
  const brokenInstances: RawFindingPageEvidence[] = []

  for (const link of evidence.links) {
    if (link.link_type !== 'internal') continue
    const targetPage = context.pageIndex.get(link.target_url)
    if (!targetPage) continue

    const sourcePage = sourcePageById.get(link.source_page_id)
    const sourceUrl = sourcePage?.url ?? link.target_url

    const wasRedirected = !!targetPage.final_url && targetPage.final_url !== targetPage.url && targetPage.status === 'completed'
    if (wasRedirected) {
      redirectedInstances.push({
        url: sourceUrl,
        affectedResourceUrl: link.target_url,
        currentState: { label: 'Internal link points to', value: `${link.target_url} (redirects, HTTP ${targetPage.http_status ?? 'unknown'})` },
        desiredState: { label: 'Recommended link target', value: targetPage.final_url },
        proposedChange: `Replace the link to ${link.target_url} with ${targetPage.final_url}.`,
        remediationType: 'url_replacement',
        detail: { linksTo: link.target_url, finalUrl: targetPage.final_url, targetHttpStatus: targetPage.http_status },
      })
    }

    const isBroken =
      targetPage.status === 'failed' ||
      (targetPage.status === 'completed' && typeof targetPage.http_status === 'number' && (targetPage.http_status < 200 || targetPage.http_status >= 300))
    if (isBroken) {
      const stateDescription = targetPage.status === 'failed' ? `could not be reached (${targetPage.error_reason ?? 'fetch failed'})` : `returns HTTP ${targetPage.http_status}`
      brokenInstances.push({
        url: sourceUrl,
        affectedResourceUrl: link.target_url,
        currentState: { label: 'Internal link points to', value: `${link.target_url} (${stateDescription})` },
        desiredState: null, // no confident replacement target exists for a broken destination — never guessed
        proposedChange: `Update or remove the link to ${link.target_url}, or fix/redirect that destination to a working page.`,
        remediationType: 'url_replacement',
        detail: { linksTo: link.target_url, targetHttpStatus: targetPage.http_status, targetFetchFailed: targetPage.status === 'failed' },
      })
    }
  }

  if (redirectedInstances.length > 0) {
    const uniqueTargets = new Set(redirectedInstances.map((i) => i.affectedResourceUrl))
    const uniqueSources = new Set(redirectedInstances.map((i) => i.url))
    findings.push({
      checkKey: 'internal_link_to_redirected_url',
      category: 'redirects',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Internal links point to redirected URLs',
      explanation: `${redirectedInstances.length} internal link occurrence${redirectedInstances.length === 1 ? '' : 's'} across ${uniqueSources.size} page${uniqueSources.size === 1 ? '' : 's'} point${redirectedInstances.length === 1 ? 's' : ''} at ${uniqueTargets.size} URL${uniqueTargets.size === 1 ? '' : 's'} that redirect instead of loading directly.`,
      whyItMatters: 'Linking directly to the final URL is faster for visitors and avoids diluting ranking signals across a redirect hop.',
      recommendation: 'Update these internal links to point straight to each destination’s final URL — see the affected instances below for the exact source page, current target, and recommended replacement.',
      evidence: {},
      affectedPages: redirectedInstances,
    })
  }

  if (brokenInstances.length > 0) {
    const uniqueTargets = new Set(brokenInstances.map((i) => i.affectedResourceUrl))
    const uniqueSources = new Set(brokenInstances.map((i) => i.url))
    findings.push({
      checkKey: 'internal_link_to_broken_url',
      category: 'redirects',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Internal links point to broken URLs',
      explanation: `${brokenInstances.length} internal link occurrence${brokenInstances.length === 1 ? '' : 's'} across ${uniqueSources.size} page${uniqueSources.size === 1 ? '' : 's'} point${brokenInstances.length === 1 ? 's' : ''} at ${uniqueTargets.size} URL${uniqueTargets.size === 1 ? '' : 's'} that ${uniqueTargets.size === 1 ? 'is' : 'are'} broken.`,
      whyItMatters: 'A broken internal link sends visitors and search engines to a dead end, wasting the value of whatever page linked to it.',
      recommendation: 'Update or remove these links, or fix/redirect the broken destination to a relevant working page — see the affected instances below.',
      evidence: {},
      affectedPages: brokenInstances,
    })
  }

  const httpsDowngradePages = evidence.pages.filter(
    (page) => page.status === 'completed' && page.url.startsWith('https:') && !!page.final_url && page.final_url.startsWith('http:')
  )
  if (httpsDowngradePages.length > 0) {
    findings.push({
      checkKey: 'https_downgrade_redirect',
      category: 'redirects',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'HTTPS pages redirect to an insecure HTTP URL',
      explanation: `${httpsDowngradePages.length} page${httpsDowngradePages.length === 1 ? '' : 's'} start${httpsDowngradePages.length === 1 ? 's' : ''} on HTTPS but redirect to an insecure HTTP URL.`,
      whyItMatters: 'Downgrading from HTTPS to HTTP exposes visitors to an insecure connection and can trigger browser security warnings.',
      recommendation: 'Update redirect rules so HTTPS requests never redirect to an insecure HTTP URL.',
      evidence: {},
      affectedPages: httpsDowngradePages.map((page) => ({
        url: page.url,
        currentState: { label: 'This page redirects to', value: page.final_url },
        desiredState: { label: 'Recommended redirect target', value: page.url },
        proposedChange: `Update the server/redirect rule for ${page.url} so it never redirects to an insecure HTTP URL.`,
        remediationType: 'directive_change',
        detail: { finalUrl: page.final_url },
      })),
    })
  }

  return findings
}
