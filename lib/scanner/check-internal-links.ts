import { fetchPage, type FetchPageResult } from './checks'
import type { DiscoveredLink } from './crawl-website'
import type { IssueSeverity, ScanIssue } from './issue-definitions'
import { isCrawlablePageUrl, isSameHost } from './url-utils'

export const MAX_LINK_TARGETS = 100
const CONCURRENCY = 5

export type InternalLinkIssueRow = {
  pageUrl: string
  issue: ScanIssue
}

function pathLabel(url: string): string {
  try {
    const { pathname, search } = new URL(url)
    const path = `${pathname}${search}`
    return path === '' ? '/' : path
  } catch {
    return url
  }
}

/** HEAD first (cheaper); falls back to GET only if HEAD failed outright or isn't supported (405). */
async function checkLinkTarget(url: string): Promise<FetchPageResult> {
  const headResult = await fetchPage(url, { method: 'HEAD' })
  const needsGetFallback = !headResult.ok || headResult.finalStatus === 405
  return needsGetFallback ? fetchPage(url, { method: 'GET' }) : headResult
}

type IssueTemplate = {
  title: string
  type: string
  severity: IssueSeverity
  description: string
  recommendation: string
}

function classifyResult(targetUrl: string, result: FetchPageResult): IssueTemplate | null {
  const path = pathLabel(targetUrl)

  if (!result.ok) {
    if (result.reason === 'redirect_loop' || result.reason === 'too_many_redirects') {
      return {
        title: `Internal link has a redirect problem: ${path}`,
        type: 'technical',
        severity: 'high',
        description: `The internal link to ${targetUrl} ${
          result.reason === 'redirect_loop' ? 'enters a redirect loop' : 'requires too many redirects'
        } and could not be reached.`,
        recommendation:
          'Fix the redirect rules for this destination, or update the link to point directly to a working URL.',
      }
    }

    // timeout / network / blocked
    return {
      title: `Internal link could not be verified: ${path}`,
      type: 'technical',
      severity: 'medium',
      description: `The internal link to ${targetUrl} could not be checked (${
        result.reason === 'timeout' ? 'it timed out' : 'a network error occurred'
      }).`,
      recommendation: 'Manually verify this link still works.',
    }
  }

  const status = result.finalStatus

  if (status === 404 || status === 410) {
    return {
      title: `Broken internal link: ${path}`,
      type: 'technical',
      severity: 'high',
      description: `The internal link to ${targetUrl} returns an HTTP ${status} response.`,
      recommendation:
        'Update or remove the link, or redirect the broken destination to a relevant working page.',
    }
  }

  if (status >= 500 && status <= 599) {
    return {
      title: `Internal link points to a server-error page: ${path}`,
      type: 'technical',
      severity: 'high',
      description: `The internal link to ${targetUrl} returns an HTTP ${status} server error.`,
      recommendation: 'Investigate the server error on the destination page.',
    }
  }

  if (status === 403) {
    return {
      title: `Internal link could not be verified: ${path}`,
      type: 'technical',
      severity: 'low',
      description: `The internal link to ${targetUrl} returned an HTTP 403 Forbidden response, so Website Care could not confirm whether it works.`,
      recommendation: 'Manually verify this link is intentional and working as expected.',
    }
  }

  if (status < 200 || status >= 300) {
    return {
      title: `Internal link could not be verified: ${path}`,
      type: 'technical',
      severity: 'medium',
      description: `The internal link to ${targetUrl} returned an unexpected HTTP ${status} response.`,
      recommendation: 'Manually verify this link is intentional and working as expected.',
    }
  }

  return null // healthy target
}

/**
 * Checks up to MAX_LINK_TARGETS deduplicated internal link targets
 * discovered while crawling (excluding targets already analyzed as crawled
 * pages, to avoid duplicate diagnostics for the same URL). Requests run in
 * small batches (CONCURRENCY at a time via Promise.all per batch) rather
 * than fully sequential or fully unbounded-parallel.
 *
 * Each broken target gets a title that embeds its own path (e.g.
 * "Broken internal link: /old-page"), rather than one shared generic title.
 * This is what lets the existing title/type/severity aggregation correctly
 * group "the same broken target, found on N source pages" into one entry
 * showing N affected pages — a shared generic title would instead merge
 * unrelated broken targets into a single misleading group, since the
 * schema has no separate field to key on.
 */
export async function checkInternalLinks(
  discoveredLinks: DiscoveredLink[],
  crawledUrls: Set<string>,
  hostname: string
): Promise<InternalLinkIssueRow[]> {
  const targetToSources = new Map<string, Set<string>>()

  for (const link of discoveredLinks) {
    if (crawledUrls.has(link.targetUrl)) continue
    if (!isSameHost(link.targetUrl, hostname)) continue
    if (!isCrawlablePageUrl(link.targetUrl)) continue

    const sources = targetToSources.get(link.targetUrl) ?? new Set<string>()
    sources.add(link.sourceUrl)
    targetToSources.set(link.targetUrl, sources)
  }

  const targets = Array.from(targetToSources.keys()).sort().slice(0, MAX_LINK_TARGETS)

  const rows: InternalLinkIssueRow[] = []

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((target) => checkLinkTarget(target)))

    batch.forEach((targetUrl, index) => {
      const template = classifyResult(targetUrl, results[index])
      if (!template) return

      const sources = Array.from(targetToSources.get(targetUrl) ?? [])

      for (const sourceUrl of sources) {
        rows.push({
          pageUrl: sourceUrl,
          issue: {
            type: template.type,
            severity: template.severity,
            title: template.title,
            description: `${template.description} Found on: ${pathLabel(sourceUrl)}.`,
            recommendation: template.recommendation,
          },
        })
      }
    })
  }

  return rows
}
