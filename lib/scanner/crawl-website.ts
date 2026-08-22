import { analyzePage } from './analyze-page'
import type { ScanIssue } from './issue-definitions'
import { extractInternalLinks, normalizeUrl } from './url-utils'

export const MAX_PAGES = 20

export type CrawledPage = {
  url: string
  reachable: boolean
  score: number
  issues: ScanIssue[]
}

export type DiscoveredLink = {
  sourceUrl: string
  targetUrl: string
}

export type CrawlResult = {
  pages: CrawledPage[]
  overallScore: number
  /** Every same-host, non-asset link found on a crawled page, whether or not its target was itself crawled. */
  discoveredLinks: DiscoveredLink[]
  hostname: string
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

/**
 * Crawls up to MAX_PAGES same-host pages starting from `startUrl` (a
 * breadth-first queue with visited/queued sets for deduplication), running
 * the existing page checks on each one. Every discovered URL is revalidated
 * (protocol, extension, host, and — inside analyzePage/fetchPage — the SSRF
 * hostname guard) before it is ever fetched, regardless of where it was
 * discovered.
 */
export async function crawlWebsite(startUrl: string): Promise<CrawlResult> {
  const startingUrl = normalizeUrl(startUrl, startUrl) ?? startUrl

  let hostname = ''
  try {
    hostname = new URL(startingUrl).hostname
  } catch {
    hostname = ''
  }

  const visited = new Set<string>()
  const queued = new Set<string>([startingUrl])
  const queue: string[] = [startingUrl]
  const pages: CrawledPage[] = []
  const discoveredLinks: DiscoveredLink[] = []

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const currentUrl = queue.shift()
    if (currentUrl === undefined) break
    if (visited.has(currentUrl)) continue
    visited.add(currentUrl)

    const result = await analyzePage(currentUrl)
    pages.push({
      url: result.url,
      reachable: result.reachable,
      score: result.score,
      issues: result.issues,
    })

    if (result.reachable && result.html && hostname) {
      const baseForLinks = result.finalUrl ?? currentUrl
      const links = extractInternalLinks(result.html, baseForLinks, hostname)

      for (const link of links) {
        discoveredLinks.push({ sourceUrl: result.url, targetUrl: link })

        if (!visited.has(link) && !queued.has(link)) {
          queued.add(link)
          queue.push(link)
        }
      }
    }
  }

  const overallScore =
    pages.length > 0
      ? clampScore(Math.round(pages.reduce((sum, page) => sum + page.score, 0) / pages.length))
      : 0

  return { pages, overallScore, discoveredLinks, hostname }
}
