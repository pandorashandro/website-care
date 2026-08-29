import 'server-only'

/**
 * The exactly-four resource route families this phase supports, plus the
 * explicit non-resource outcomes a public URL can resolve to. Deliberately
 * NOT a broad regex over arbitrary paths — every family below matches an
 * EXACT segment-count shape, so routes like /collections/x/products/y,
 * /cart, /checkout, /account, /search, /apps/..., /policies/... all fall
 * through to 'unsupported' by construction, never by an explicit exclusion
 * list that could go stale.
 */
export type ShopifyStorefrontRoute =
  | { family: 'product'; handle: string }
  | { family: 'collection'; handle: string }
  | { family: 'page'; handle: string }
  | { family: 'article'; blogHandle: string; articleHandle: string }
  | { family: 'homepage' }
  | { family: 'localized_unsupported' }
  | { family: 'unsupported' }

export type ClassifiedShopifyUrl = { hostname: string; route: ShopifyStorefrontRoute }

/** Narrow, conservative: ISO-639-1-shaped codes only, optionally with a region suffix (en, fr, en-ca, fr-fr). */
const LOCALE_SEGMENT_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/
const ROUTE_ROOTS = new Set(['products', 'collections', 'pages', 'blogs'])
const MAX_SEGMENT_LENGTH = 255

/**
 * Splits a RAW (still percent-encoded) pathname into decoded segments,
 * decoding each segment INDIVIDUALLY rather than decoding the whole path
 * up front — decoding first and splitting second would let an encoded
 * `%2F` inside a handle be silently treated as introducing a new path
 * segment, which is not the same thing as an actual `/` in the URL.
 */
function splitPathSegments(rawPathname: string): string[] | null {
  const rawSegments = rawPathname.split('/').filter((segment) => segment.length > 0)
  const decoded: string[] = []

  for (const segment of rawSegments) {
    let value: string
    try {
      value = decodeURIComponent(segment)
    } catch {
      return null
    }

    if (value.length === 0 || value.length > MAX_SEGMENT_LENGTH) return null
    // Reject control characters and a decoded slash smuggled in via
    // percent-encoding — a real `/` here would mean this "segment" is
    // actually trying to represent more than one path level.
    if (/[\x00-\x1f\x7f]/.test(value) || value.includes('/')) return null

    decoded.push(value)
  }

  return decoded
}

function matchRoute(segments: string[]): ShopifyStorefrontRoute {
  const [first, second, third] = segments

  // Confident locale/market prefix detection: only classified as such when
  // the FOLLOWING segment is itself a recognized route root — a bare
  // two-letter segment with no recognized route after it is simply
  // 'unsupported', never guessed at as "probably localized."
  if (first && LOCALE_SEGMENT_PATTERN.test(first) && second && ROUTE_ROOTS.has(second)) {
    return { family: 'localized_unsupported' }
  }

  if (first === 'products' && second !== undefined && segments.length === 2) {
    return { family: 'product', handle: second }
  }

  if (first === 'collections' && second !== undefined && segments.length === 2) {
    return { family: 'collection', handle: second }
  }

  if (first === 'pages' && second !== undefined && segments.length === 2) {
    return { family: 'page', handle: second }
  }

  if (first === 'blogs' && second !== undefined && third !== undefined && segments.length === 3) {
    return { family: 'article', blogHandle: second, articleHandle: third }
  }

  return { family: 'unsupported' }
}

/**
 * Classifies a public Shopify storefront URL into one of the four
 * supported resource route families, or an explicit non-resource outcome
 * (homepage, a confidently-detected localized/market prefix, or generic
 * unsupported). Requires HTTPS, rejects userinfo and explicit ports,
 * ignores (rather than rejects) query strings and fragments — a scanned
 * page URL legitimately carrying `?utm_source=...` is not malformed, it
 * simply has route-irrelevant decoration that this function silently
 * drops rather than trying to interpret.
 *
 * Returns null only for a structurally invalid URL (unparsable, wrong
 * scheme, userinfo, port, malformed percent-encoding) — a well-formed URL
 * that just doesn't match a supported route returns `{ family:
 * 'unsupported' }`, not null, so callers can distinguish "this input
 * wasn't even a URL" from "this URL doesn't map to anything we support."
 */
export function classifyShopifyStorefrontRoute(rawUrl: string): ClassifiedShopifyUrl | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (parsed.port) return null

  // Node's URL parser already punycode-normalizes IDN hostnames, so a
  // Unicode-homograph hostname can never coincidentally equal the plain-
  // ASCII myshopify.com domain or primary domain host it would later be
  // compared against — no separate IDN handling is needed here.
  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) return null

  if (parsed.pathname === '' || parsed.pathname === '/') {
    return { hostname, route: { family: 'homepage' } }
  }

  const segments = splitPathSegments(parsed.pathname)
  if (!segments) return null

  if (segments.length === 0) {
    return { hostname, route: { family: 'homepage' } }
  }

  return { hostname, route: matchRoute(segments) }
}
