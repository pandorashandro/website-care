import { fetchPage } from './checks'
import { buildIssue, type ScanIssue } from './issue-definitions'
import { isSameHost, normalizeUrl } from './url-utils'

export const MAX_SITEMAP_FILES = 5
const MAX_LOC_ENTRIES_PER_SITEMAP = 500

function extractLocEntries(xml: string): string[] {
  const matches = xml.match(/<loc>([^<]*)<\/loc>/gi) ?? []

  return matches
    .slice(0, MAX_LOC_ENTRIES_PER_SITEMAP)
    .map((tag) => tag.replace(/<\/?loc>/gi, '').trim())
    .filter((url) => url.length > 0)
}

function buildCandidateList(websiteUrl: string, sitemapUrlsFromRobots: string[]): string[] {
  const origin = new URL(websiteUrl).origin
  const hostname = new URL(websiteUrl).hostname

  const seen = new Set<string>()
  const candidates: string[] = []

  for (const raw of [...sitemapUrlsFromRobots, `${origin}/sitemap.xml`]) {
    if (candidates.length >= MAX_SITEMAP_FILES) break

    const normalized = normalizeUrl(raw, origin)
    if (!normalized) continue
    if (!isSameHost(normalized, hostname)) continue // conservative: only check same-host sitemaps
    if (seen.has(normalized)) continue

    seen.add(normalized)
    candidates.push(normalized)
  }

  return candidates
}

/**
 * Checks up to MAX_SITEMAP_FILES sitemap candidates — robots.txt-declared
 * ones first, then the standard /sitemap.xml fallback — with lightweight
 * (not a full XML parser) validation. Does not recurse into sitemap index
 * entries beyond this file-count cap.
 */
export async function checkSitemap(
  websiteUrl: string,
  sitemapUrlsFromRobots: string[]
): Promise<ScanIssue[]> {
  const candidates = buildCandidateList(websiteUrl, sitemapUrlsFromRobots)
  if (candidates.length === 0) {
    return []
  }

  const hostname = new URL(websiteUrl).hostname
  const issues: ScanIssue[] = []
  let anySucceeded = false
  let anyNonNotFoundFailure = false

  for (const candidateUrl of candidates) {
    const result = await fetchPage(candidateUrl)

    if (!result.ok) {
      issues.push(
        buildIssue('sitemap_unreachable', `webioom could not fetch the sitemap at ${candidateUrl}.`)
      )
      anyNonNotFoundFailure = true
      continue
    }

    if (result.finalStatus === 404 || result.finalStatus === 410) {
      continue
    }

    if (result.finalStatus < 200 || result.finalStatus >= 300) {
      issues.push(
        buildIssue(
          'sitemap_unreachable',
          `The sitemap at ${candidateUrl} returned an unexpected HTTP ${result.finalStatus} response.`
        )
      )
      anyNonNotFoundFailure = true
      continue
    }

    anySucceeded = true

    const looksValid = /<urlset/i.test(result.html) || /<sitemapindex/i.test(result.html)
    if (!looksValid) {
      issues.push(
        buildIssue(
          'sitemap_invalid',
          `The content at ${candidateUrl} does not appear to contain a <urlset> or <sitemapindex> element.`
        )
      )
      continue
    }

    const locEntries = extractLocEntries(result.html)
    const hasExternal = locEntries.some((loc) => {
      try {
        return new URL(loc).hostname.toLowerCase() !== hostname.toLowerCase()
      } catch {
        return false
      }
    })

    if (hasExternal) {
      issues.push(
        buildIssue(
          'sitemap_external_urls',
          `The sitemap at ${candidateUrl} includes URLs pointing to a different domain than the scanned site.`
        )
      )
    }
  }

  // Only report "not found" when every candidate was cleanly 404/410 — if
  // some other failure occurred, the specific issues above already explain
  // what went wrong, and a "not found" on top would be redundant noise.
  if (!anySucceeded && !anyNonNotFoundFailure) {
    issues.push(
      buildIssue(
        'sitemap_not_found',
        'webioom could not find an XML sitemap from robots.txt or the standard /sitemap.xml location.'
      )
    )
  }

  return issues
}
