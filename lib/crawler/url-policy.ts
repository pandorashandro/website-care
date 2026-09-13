import { normalizeUrl, isSameHost, isCrawlablePageUrl } from '@/lib/scanner/url-utils'

export { isSameHost, isCrawlablePageUrl }

/**
 * Phase 25A — the crawler's own URL identity policy, built ON TOP OF
 * (never duplicating) lib/scanner/url-utils.ts's normalizeUrl, which
 * already handles: relative/absolute resolution, fragment stripping,
 * trailing-slash normalization, non-http(s)-scheme rejection, hostname
 * lowercasing, and default-port omission (`:80`/`:443` are dropped
 * automatically by the WHATWG URL parser itself when they match the
 * scheme's default — no extra code needed for that).
 *
 * What this module adds, specifically for crawl-time URL identity (the
 * existing scanner never needed this — a single-page scan doesn't have a
 * "have I already queued this exact URL" question):
 *
 * QUERY PARAMETER POLICY (the "defensible policy" this phase asks for):
 * - A fixed, documented denylist of known tracking/session parameters
 *   (utm_*, click-id parameters from major ad platforms, common
 *   email-campaign parameters) is stripped entirely — these are
 *   demonstrably not part of a page's actual identity/content.
 * - Every OTHER query parameter is kept — never stripped by default. A
 *   query string can legitimately select different content (pagination,
 *   filters, locale), so silently discarding an undeclared parameter risks
 *   collapsing genuinely different pages into one. This is deliberately
 *   the conservative direction: over-crawling a few tracking-parameter
 *   variants would have been the safer failure mode than under-crawling
 *   real content, but stripping only a well-known denylist avoids even
 *   that, rather than guessing further.
 * - Remaining parameters are re-serialized in sorted key order, so
 *   `?b=2&a=1` and `?a=1&b=2` (the same content, differently ordered)
 *   normalize to the identical URL rather than being treated as two
 *   distinct pages.
 */
const TRACKING_PARAM_DENYLIST = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gclsrc',
  'dclid',
  'fbclid',
  'msclkid',
  'twclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'igshid',
  '_hsenc',
  '_hsmi',
])

/**
 * The crawler's canonical URL identity — this is the value stored in
 * `crawl_pages.url` and is what the database's `(crawl_run_id, url)`
 * uniqueness constraint dedupes against. Returns null for anything
 * normalizeUrl itself rejects (non-navigable schemes, unparseable URLs).
 */
export function normalizeCrawlUrl(rawUrl: string, baseUrl: string): string | null {
  const normalized = normalizeUrl(rawUrl, baseUrl)
  if (!normalized) return null

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return null
  }

  if ([...parsed.searchParams.keys()].length === 0) {
    return parsed.toString()
  }

  const kept = new URLSearchParams()
  for (const [key, value] of parsed.searchParams) {
    if (TRACKING_PARAM_DENYLIST.has(key.toLowerCase())) continue
    kept.append(key, value)
  }

  kept.sort()
  parsed.search = kept.toString()

  return parsed.toString()
}

/**
 * True when `url` is within the crawl's same-site boundary AND is a page
 * type worth crawling (reuses isSameHost/isCrawlablePageUrl unchanged —
 * see their own doc comments in lib/scanner/url-utils.ts).
 */
export function isCrawlableSameSiteUrl(url: string, hostname: string): boolean {
  return isSameHost(url, hostname) && isCrawlablePageUrl(url)
}
