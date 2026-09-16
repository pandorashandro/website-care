import { fetchPage } from '@/lib/scanner/checks'
import { extractLocEntries } from '@/lib/scanner/check-sitemap'
import { normalizeUrl, isSameHost } from '@/lib/scanner/url-utils'
import { MAX_SITEMAP_FILES, MAX_SITEMAP_INDEX_DEPTH, MAX_URLS_FROM_SITEMAPS } from './limits'

/**
 * Phase 25A — sitemap-driven URL discovery for the crawler. Separate from
 * lib/scanner/check-sitemap.ts, which validates a handful of sitemap
 * candidates for scanner ISSUES (not-found/invalid/external-URLs) and
 * deliberately does not recurse into a sitemap index at all. The crawler
 * needs actual URL discovery, including from sitemap INDEXES (a sitemap
 * that itself lists other sitemap files — extremely common on larger
 * sites), which is exactly the "pathological sitemap expansion" this
 * phase's security checkpoint calls out: an index can point at more
 * indexes, so recursion depth and total-file/total-URL counts are all
 * independently bounded below, regardless of how deep or wide a
 * malicious or malformed sitemap tries to go.
 *
 * Reuses check-sitemap.ts's own `extractLocEntries` (same regex-based
 * `<loc>` extraction, same per-file cap) rather than a second copy, and
 * fetchPage for every fetch (same SSRF/redirect/timeout/size protections
 * as everything else in this codebase).
 */

export type DiscoveredSitemapUrls = {
  urls: string[]
  filesFetched: number
  truncated: boolean
  /** Phase 26 — true if at least one candidate sitemap file returned a reachable 2xx response (whether or not it ultimately contained usable URLs). Lets a caller distinguish "no sitemap could be fetched at all" from "a sitemap was fetched but had nothing usable in it" without any additional network calls. */
  reachable: boolean
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex/i.test(xml)
}

function isUrlSet(xml: string): boolean {
  return /<urlset/i.test(xml)
}

/**
 * Discovers page URLs from a website's sitemap(s), starting from whatever
 * `Sitemap:` directives robots.txt declared (if any) plus the standard
 * `/sitemap.xml` fallback, recursing into sitemap indexes up to
 * MAX_SITEMAP_INDEX_DEPTH levels deep. Bounded by THREE independent
 * limits so no single dimension of a pathological sitemap tree (very
 * deep, very wide, or very large individual files) can cause unbounded
 * work: total sitemap FILES fetched (MAX_SITEMAP_FILES), index recursion
 * DEPTH (MAX_SITEMAP_INDEX_DEPTH), and total URLs collected
 * (MAX_URLS_FROM_SITEMAPS). Hitting any limit stops discovery early and
 * reports `truncated: true` rather than silently continuing or failing —
 * a truncated sitemap discovery is not an error, just incomplete.
 */
export async function discoverSitemapUrls(websiteUrl: string, sitemapUrlsFromRobots: string[]): Promise<DiscoveredSitemapUrls> {
  const origin = new URL(websiteUrl).origin
  const hostname = new URL(websiteUrl).hostname

  const seenFiles = new Set<string>()
  const seenUrls = new Set<string>()
  const collected: string[] = []
  let filesFetched = 0
  let truncated = false
  let reachable = false

  const initialCandidates = [...sitemapUrlsFromRobots, `${origin}/sitemap.xml`]
    .map((raw) => normalizeUrl(raw, origin))
    .filter((url): url is string => !!url && isSameHost(url, hostname))

  const queue: Array<{ url: string; depth: number }> = []
  for (const url of initialCandidates) {
    if (seenFiles.has(url)) continue
    seenFiles.add(url)
    queue.push({ url, depth: 0 })
  }

  while (queue.length > 0) {
    const { url, depth } = queue.shift() as { url: string; depth: number }

    if (filesFetched >= MAX_SITEMAP_FILES) {
      truncated = true
      break
    }

    const result = await fetchPage(url)
    filesFetched++

    if (!result.ok || result.finalStatus < 200 || result.finalStatus >= 300) continue

    reachable = true

    if (isSitemapIndex(result.html)) {
      if (depth >= MAX_SITEMAP_INDEX_DEPTH) {
        truncated = true
        continue
      }

      const nested = extractLocEntries(result.html)
        .map((raw) => normalizeUrl(raw, url))
        .filter((nestedUrl): nestedUrl is string => !!nestedUrl && isSameHost(nestedUrl, hostname) && !seenFiles.has(nestedUrl))

      for (const nestedUrl of nested) {
        seenFiles.add(nestedUrl)
        queue.push({ url: nestedUrl, depth: depth + 1 })
      }
      continue
    }

    if (!isUrlSet(result.html)) continue

    for (const rawLoc of extractLocEntries(result.html)) {
      if (collected.length >= MAX_URLS_FROM_SITEMAPS) {
        truncated = true
        break
      }

      const normalized = normalizeUrl(rawLoc, url)
      if (!normalized || !isSameHost(normalized, hostname)) continue
      if (seenUrls.has(normalized)) continue

      seenUrls.add(normalized)
      collected.push(normalized)
    }

    if (collected.length >= MAX_URLS_FROM_SITEMAPS) {
      truncated = true
      break
    }
  }

  // Any files still queued when a limit stopped the loop means discovery
  // was cut short, even if it happened to be exactly at a file boundary.
  if (queue.length > 0) truncated = true

  return { urls: collected, filesFetched, truncated, reachable }
}
