import 'server-only'
import { fetchWixApi, type WixApiResult } from './client'

/**
 * Exactly the two item types Wix resource mapping can currently prove an
 * identity for — see docs/wix-api-research.md §6. `STATIC_PAGE` (and any
 * other item type reachable only through the Item SEO Tags API, which
 * exposes no URL/slug field at all) is deliberately absent from this
 * union: there is no currently-accessible Wix REST API that maps a public
 * page URL to a static page's item ID, so claiming support for it would be
 * exactly the kind of unproven identity match this codebase's fixability
 * model already refuses everywhere else (see Shopify's Image Alt
 * deferral for the same class of decision).
 */
export type WixResourceFamily = 'blog_post' | 'stores_product'

export type WixResourceMappingFailureReason =
  | 'invalid_url'
  | 'homepage_unsupported'
  | 'resource_not_found'
  | 'ambiguous_resource'
  | 'unauthorized'
  | 'connection_error'
  | 'malformed_response'

export type WixResourceMapping =
  | { ok: true; resourceType: 'blog_post'; itemId: string; slug: string; title: string | null }
  | { ok: true; resourceType: 'stores_product'; itemId: string; slug: string; title: string | null }
  | { ok: false; reason: WixResourceMappingFailureReason }

/** Exported (Phase Wix-1) purely so this deterministic parsing logic has direct permanent test coverage (tests/wix-resource-mapping.test.ts) without needing to mock fetchWixApi or perform a live request. */
export function extractCandidateSlug(pageUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return null
  }

  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) return null // homepage — handled by the caller before slug extraction

  return segments[segments.length - 1]
}

type SlugLookup =
  | { ok: true; itemId: string; slug: string; title: string | null; urlPath: string | null }
  | { ok: false; reason: 'not_found' | 'unauthorized' | 'connection_error' | 'malformed_response' }

/** Maps fetchWixApi's transport-level failure reasons onto this module's own vocabulary — a 404 genuinely means "no such slug," never a connection problem, so the two must never be conflated. */
function toSlugLookupFailure(reason: Extract<WixApiResult, { ok: false }>['reason']): Extract<SlugLookup, { ok: false }>['reason'] {
  if (reason === 'not_found') return 'not_found'
  if (reason === 'unauthorized' || reason === 'forbidden') return 'unauthorized'
  if (reason === 'malformed_response') return 'malformed_response'
  return 'connection_error'
}

async function lookupBlogPostBySlug(accessToken: string, slug: string): Promise<SlugLookup> {
  const result = await fetchWixApi(`/v3/posts/slugs/${encodeURIComponent(slug)}?fieldsets=URL`, accessToken)
  if (!result.ok) return { ok: false, reason: toSlugLookupFailure(result.reason) }

  const post = result.data.post
  if (!post || typeof post !== 'object') return { ok: false, reason: 'malformed_response' }

  const p = post as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.slug !== 'string') return { ok: false, reason: 'malformed_response' }

  let urlPath: string | null = null
  const url = p.url
  if (url && typeof url === 'object' && typeof (url as Record<string, unknown>).path === 'string') {
    urlPath = (url as Record<string, unknown>).path as string
  }

  return {
    ok: true,
    itemId: p.id,
    slug: p.slug,
    title: typeof p.title === 'string' ? p.title : null,
    urlPath,
  }
}

async function lookupProductBySlug(accessToken: string, slug: string): Promise<SlugLookup> {
  const result = await fetchWixApi(`/stores/v3/products/slug/${encodeURIComponent(slug)}?fields=URL`, accessToken)
  if (!result.ok) return { ok: false, reason: toSlugLookupFailure(result.reason) }

  const product = result.data.product
  if (!product || typeof product !== 'object') return { ok: false, reason: 'malformed_response' }

  const p = product as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.slug !== 'string') return { ok: false, reason: 'malformed_response' }

  let urlPath: string | null = null
  const url = p.url
  if (url && typeof url === 'object' && typeof (url as Record<string, unknown>).relativePath === 'string') {
    urlPath = (url as Record<string, unknown>).relativePath as string
  }

  return {
    ok: true,
    itemId: p.id,
    slug: p.slug,
    title: typeof p.name === 'string' ? p.name : null,
    urlPath,
  }
}

/** Normalizes a path for comparison: strips a leading/trailing slash so `/post/my-slug` and `post/my-slug/` compare equal. Exported for direct test coverage — see extractCandidateSlug's doc comment. */
export function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

/**
 * Resolves a public Wix page URL to a confirmed, identity-proven resource,
 * or a specific, named failure reason — never a guess. Mirrors
 * lib/integrations/shopify/resource-mapping.ts's resolveShopifyResource in
 * spirit (fail closed on ambiguity/not-found, never trust a client-supplied
 * identifier), but the mechanism is necessarily different: Wix gives no
 * single "resolve any URL" endpoint (see docs/wix-api-research.md §6), so
 * this tries each of the two provably-resolvable item types' own
 * "get by slug" endpoint using the URL's last path segment as the
 * candidate slug, and only trusts a match whose OWN reported url path
 * matches the scanned URL's path — a slug collision between a blog post
 * and a product that both happen to exist, or a slug that matches by
 * coincidence but at a different path, both fail closed rather than
 * guessing which one the scan actually meant.
 *
 * `pageUrl`/`accessToken` must already be trusted server-derived values —
 * this function performs no ownership or ownership-adjacent checks of its
 * own, exactly like resolveShopifyResource.
 */
export async function resolveWixResource(accessToken: string, pageUrl: string): Promise<WixResourceMapping> {
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }

  const candidateSlug = extractCandidateSlug(pageUrl)
  if (!candidateSlug) {
    return { ok: false, reason: 'homepage_unsupported' }
  }

  const scannedPath = normalizePath(parsed.pathname)

  const [postLookup, productLookup] = await Promise.all([
    lookupBlogPostBySlug(accessToken, candidateSlug),
    lookupProductBySlug(accessToken, candidateSlug),
  ])

  const postMatches = postLookup.ok && postLookup.urlPath !== null && normalizePath(postLookup.urlPath) === scannedPath
  const productMatches = productLookup.ok && productLookup.urlPath !== null && normalizePath(productLookup.urlPath) === scannedPath

  if (postMatches && productMatches) {
    return { ok: false, reason: 'ambiguous_resource' }
  }

  if (postMatches && postLookup.ok) {
    return { ok: true, resourceType: 'blog_post', itemId: postLookup.itemId, slug: postLookup.slug, title: postLookup.title }
  }

  if (productMatches && productLookup.ok) {
    return { ok: true, resourceType: 'stores_product', itemId: productLookup.itemId, slug: productLookup.slug, title: productLookup.title }
  }

  // Neither lookup produced a URL-path-confirmed match. A genuine
  // connection/auth problem on EITHER lookup is reported as such —
  // distinct from "we asked and Wix genuinely has no such slug" — so a
  // transient failure is never confused with a real not-found. Otherwise
  // this is reported as resource_not_found, which also covers what would
  // otherwise be "this is a static page": we cannot distinguish the two
  // without a Pages API to check against (see docs/wix-api-research.md
  // §6). Both are equally "webioom cannot safely proceed," so both are
  // reported identically rather than guessing which is true.
  if (!postLookup.ok && postLookup.reason !== 'not_found') {
    return { ok: false, reason: postLookup.reason }
  }
  if (!productLookup.ok && productLookup.reason !== 'not_found') {
    return { ok: false, reason: productLookup.reason }
  }

  return { ok: false, reason: 'resource_not_found' }
}
