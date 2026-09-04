import 'server-only'
import { fetchShopifyGraphQL, type ShopifyGraphQLResult } from './client'
import { classifyShopifyStorefrontRoute } from './storefront-url'
import { getShopifyStoreIdentity, hostnameMatchesStoreIdentity } from './store-identity'

export type ShopifyResourceMappingFailureReason =
  | 'invalid_url'
  | 'domain_mismatch'
  | 'unsupported_route'
  | 'homepage_unsupported'
  | 'localized_route_unsupported'
  | 'resource_not_found'
  | 'ambiguous_resource'
  | 'unauthorized'
  | 'connection_error'
  | 'malformed_response'

export type ShopifyResourceMapping =
  | { ok: true; resourceType: 'product'; gid: string; handle: string; title: string | null }
  | { ok: true; resourceType: 'collection'; gid: string; handle: string; title: string | null }
  | { ok: true; resourceType: 'page'; gid: string; handle: string; title: string | null }
  | {
      ok: true
      resourceType: 'article'
      gid: string
      handle: string
      title: string | null
      blogGid: string
      blogHandle: string
    }
  | { ok: false; reason: ShopifyResourceMappingFailureReason }

const SAFE_QUERY_HANDLE_PATTERN = /^[a-zA-Z0-9._-]+$/

/**
 * Shopify's `query:` filter argument (used for Page/Blog/Article lookups
 * below, since there is no pageByHandle/blogByHandle/articleByHandle
 * query) is a small search-syntax mini-language, built here via string
 * interpolation — unlike productByIdentifier/collectionByIdentifier, which
 * take the handle as a properly-typed GraphQL variable with no
 * interpolation risk at all. This restricts what's ever interpolated into
 * that mini-language to a conservative, self-imposed safe character set
 * (never asserted as an official Shopify handle-format guarantee) —
 * anything outside it is treated as not-found rather than risking
 * unexpected filter-syntax behavior.
 */
function toSafeQueryHandle(handle: string): string | null {
  return SAFE_QUERY_HANDLE_PATTERN.test(handle) ? handle : null
}

function graphqlFailureToMapping(result: Extract<ShopifyGraphQLResult, { ok: false }>): { ok: false; reason: ShopifyResourceMappingFailureReason } {
  switch (result.reason) {
    case 'unauthorized':
      return { ok: false, reason: 'unauthorized' }
    case 'blocked':
    case 'timeout':
    case 'network':
      return { ok: false, reason: 'connection_error' }
    case 'malformed_response':
    case 'graphql_errors':
    case 'unexpected_status':
      return { ok: false, reason: 'malformed_response' }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

const PRODUCT_BY_IDENTIFIER_QUERY = `query WebioomProductByIdentifier($identifier: ProductIdentifierInput!) {
  productByIdentifier(identifier: $identifier) {
    id
    handle
    title
  }
}`

async function resolveProduct(shopDomain: string, accessToken: string, handle: string): Promise<ShopifyResourceMapping> {
  // productByHandle is deprecated (confirmed against current official docs
  // this phase) in favor of productByIdentifier — used here exclusively.
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, PRODUCT_BY_IDENTIFIER_QUERY, {
    identifier: { handle },
  })
  if (!result.ok) return graphqlFailureToMapping(result)

  const product = asRecord(result.data.productByIdentifier)
  if (result.data.productByIdentifier === null) return { ok: false, reason: 'resource_not_found' }
  if (!product) return { ok: false, reason: 'malformed_response' }

  const gid = product.id
  const returnedHandle = product.handle
  const title = product.title

  if (typeof gid !== 'string' || typeof returnedHandle !== 'string') return { ok: false, reason: 'malformed_response' }
  // Exact-match confirmation, never fuzzy — a mismatched handle here would
  // mean Shopify resolved the identifier to something other than what the
  // URL actually claimed.
  if (returnedHandle !== handle) return { ok: false, reason: 'resource_not_found' }

  return { ok: true, resourceType: 'product', gid, handle: returnedHandle, title: typeof title === 'string' ? title : null }
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

const COLLECTION_BY_IDENTIFIER_QUERY = `query WebioomCollectionByIdentifier($identifier: CollectionIdentifierInput!) {
  collectionByIdentifier(identifier: $identifier) {
    id
    handle
    title
  }
}`

async function resolveCollection(shopDomain: string, accessToken: string, handle: string): Promise<ShopifyResourceMapping> {
  // collectionByHandle is deprecated (confirmed against current official
  // docs this phase) in favor of collectionByIdentifier — used here
  // exclusively.
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, COLLECTION_BY_IDENTIFIER_QUERY, {
    identifier: { handle },
  })
  if (!result.ok) return graphqlFailureToMapping(result)

  const collection = asRecord(result.data.collectionByIdentifier)
  if (result.data.collectionByIdentifier === null) return { ok: false, reason: 'resource_not_found' }
  if (!collection) return { ok: false, reason: 'malformed_response' }

  const gid = collection.id
  const returnedHandle = collection.handle
  const title = collection.title

  if (typeof gid !== 'string' || typeof returnedHandle !== 'string') return { ok: false, reason: 'malformed_response' }
  if (returnedHandle !== handle) return { ok: false, reason: 'resource_not_found' }

  return { ok: true, resourceType: 'collection', gid, handle: returnedHandle, title: typeof title === 'string' ? title : null }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_LOOKUP_QUERY = `query WebioomPageLookup($searchQuery: String!) {
  pages(first: 2, query: $searchQuery) {
    nodes {
      id
      handle
      title
    }
  }
}`

async function resolvePage(shopDomain: string, accessToken: string, handle: string): Promise<ShopifyResourceMapping> {
  // There is no pageByHandle query (confirmed against current official
  // docs this phase) — Page lookup uses the `pages` connection with a
  // `query: "handle:..."` filter, then exact-matches the returned handle
  // in application code rather than trusting the filter as final identity.
  const safeHandle = toSafeQueryHandle(handle)
  if (!safeHandle) return { ok: false, reason: 'resource_not_found' }

  const result = await fetchShopifyGraphQL(shopDomain, accessToken, PAGE_LOOKUP_QUERY, {
    searchQuery: `handle:${safeHandle}`,
  })
  if (!result.ok) return graphqlFailureToMapping(result)

  const pages = asRecord(result.data.pages)
  const nodes = pages?.nodes
  if (!Array.isArray(nodes)) return { ok: false, reason: 'malformed_response' }

  const exactMatches = nodes
    .map(asRecord)
    .filter((node): node is Record<string, unknown> => node !== null && node.handle === handle)

  if (exactMatches.length > 1) return { ok: false, reason: 'ambiguous_resource' }
  if (exactMatches.length === 0) return { ok: false, reason: 'resource_not_found' }

  const gid = exactMatches[0].id
  const returnedHandle = exactMatches[0].handle
  const title = exactMatches[0].title

  if (typeof gid !== 'string' || typeof returnedHandle !== 'string') return { ok: false, reason: 'malformed_response' }

  return { ok: true, resourceType: 'page', gid, handle: returnedHandle, title: typeof title === 'string' ? title : null }
}

// ---------------------------------------------------------------------------
// Article (must prove exact blog + exact article + their relationship)
// ---------------------------------------------------------------------------

const BLOG_LOOKUP_QUERY = `query WebioomBlogLookup($searchQuery: String!) {
  blogs(first: 2, query: $searchQuery) {
    nodes {
      id
      handle
    }
  }
}`

const ARTICLE_LOOKUP_QUERY = `query WebioomArticleLookup($searchQuery: String!) {
  articles(first: 5, query: $searchQuery) {
    nodes {
      id
      handle
      title
      blog {
        id
        handle
      }
    }
  }
}`

async function resolveArticle(
  shopDomain: string,
  accessToken: string,
  blogHandle: string,
  articleHandle: string
): Promise<ShopifyResourceMapping> {
  // There is no blogByHandle/articleByHandle query (confirmed against
  // current official docs this phase). Article handles are only unique
  // WITHIN a blog, not shop-wide, so the article lookup below is never
  // trusted by handle alone — every candidate's own `blog.id` must equal
  // the exact blog GID resolved first.
  const safeBlogHandle = toSafeQueryHandle(blogHandle)
  const safeArticleHandle = toSafeQueryHandle(articleHandle)
  if (!safeBlogHandle || !safeArticleHandle) return { ok: false, reason: 'resource_not_found' }

  const blogResult = await fetchShopifyGraphQL(shopDomain, accessToken, BLOG_LOOKUP_QUERY, {
    searchQuery: `handle:${safeBlogHandle}`,
  })
  if (!blogResult.ok) return graphqlFailureToMapping(blogResult)

  const blogNodes = asRecord(blogResult.data.blogs)?.nodes
  if (!Array.isArray(blogNodes)) return { ok: false, reason: 'malformed_response' }

  const exactBlogMatches = blogNodes
    .map(asRecord)
    .filter((node): node is Record<string, unknown> => node !== null && node.handle === blogHandle)

  if (exactBlogMatches.length > 1) return { ok: false, reason: 'ambiguous_resource' }
  if (exactBlogMatches.length === 0) return { ok: false, reason: 'resource_not_found' }

  const blogGid = exactBlogMatches[0].id
  const returnedBlogHandle = exactBlogMatches[0].handle
  if (typeof blogGid !== 'string' || typeof returnedBlogHandle !== 'string') return { ok: false, reason: 'malformed_response' }

  const articleResult = await fetchShopifyGraphQL(shopDomain, accessToken, ARTICLE_LOOKUP_QUERY, {
    searchQuery: `handle:${safeArticleHandle}`,
  })
  if (!articleResult.ok) return graphqlFailureToMapping(articleResult)

  const articleNodes = asRecord(articleResult.data.articles)?.nodes
  if (!Array.isArray(articleNodes)) return { ok: false, reason: 'malformed_response' }

  const exactArticleMatches = articleNodes
    .map(asRecord)
    .filter((node): node is Record<string, unknown> => {
      if (node === null || node.handle !== articleHandle) return false
      const blog = asRecord(node.blog)
      return blog !== null && blog.id === blogGid
    })

  if (exactArticleMatches.length > 1) return { ok: false, reason: 'ambiguous_resource' }
  if (exactArticleMatches.length === 0) return { ok: false, reason: 'resource_not_found' }

  const gid = exactArticleMatches[0].id
  const returnedHandle = exactArticleMatches[0].handle
  const title = exactArticleMatches[0].title

  if (typeof gid !== 'string' || typeof returnedHandle !== 'string') return { ok: false, reason: 'malformed_response' }

  return {
    ok: true,
    resourceType: 'article',
    gid,
    handle: returnedHandle,
    title: typeof title === 'string' ? title : null,
    blogGid,
    blogHandle: returnedBlogHandle,
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * The sole entry point for mapping a public Shopify storefront URL to an
 * exact, server-confirmed Admin resource. Never accepts a client-supplied
 * GID.
 *
 * Deliberately takes an already-resolved `shopDomain`/`accessToken` rather
 * than a `websiteId` — mirroring lib/integrations/wordpress/adapter.ts's
 * own functions, which all take already-decrypted credentials as plain
 * parameters and never reach back into app/dashboard/websites/[id]/
 * themselves. The caller (a future Title/Meta Apply action, in
 * app/dashboard/websites/[id]/) is responsible for the full session:
 * authenticate user → verify website ownership → call
 * getValidShopifyAccessToken(websiteId) → pass the result's
 * `myshopifyDomain`/`accessToken` in here. This keeps
 * lib/integrations/shopify/ fully self-contained with zero dependency on
 * app/, exactly matching the WordPress adapter's boundary.
 *
 * Domain trust: the requested URL's hostname must exactly match either the
 * connected shop's canonical myshopify.com domain or its current, freshly
 * queried primary domain — established fresh on every call, never assumed
 * from the webioom website record's own stored URL, and never widened.
 *
 * Homepage, unsupported routes, and confidently-detected localized/market
 * prefixes are all rejected before any GraphQL request is made — no
 * Admin API cost is spent resolving something this phase doesn't support.
 */
export async function resolveShopifyResource(
  shopDomain: string,
  accessToken: string,
  pageUrl: string
): Promise<ShopifyResourceMapping> {
  const classified = classifyShopifyStorefrontRoute(pageUrl)
  if (!classified) return { ok: false, reason: 'invalid_url' }

  const { hostname, route } = classified

  if (route.family === 'homepage') return { ok: false, reason: 'homepage_unsupported' }
  if (route.family === 'localized_unsupported') return { ok: false, reason: 'localized_route_unsupported' }
  if (route.family === 'unsupported') return { ok: false, reason: 'unsupported_route' }

  const identityResult = await getShopifyStoreIdentity(shopDomain, accessToken)
  if (!identityResult.ok) return graphqlFailureToMapping(identityResult)

  if (!hostnameMatchesStoreIdentity(hostname, identityResult.identity)) {
    return { ok: false, reason: 'domain_mismatch' }
  }

  switch (route.family) {
    case 'product':
      return resolveProduct(shopDomain, accessToken, route.handle)
    case 'collection':
      return resolveCollection(shopDomain, accessToken, route.handle)
    case 'page':
      return resolvePage(shopDomain, accessToken, route.handle)
    case 'article':
      return resolveArticle(shopDomain, accessToken, route.blogHandle, route.articleHandle)
  }
}

/**
 * Translates a resource-mapping failure into a user-safe diagnostic — never
 * a guess, never a generic catch-all when a more specific reason is
 * available. A single shared implementation (moved here from
 * shopify-title-fix-actions.ts/shopify-meta-fix-actions.ts, which had two
 * byte-identical copies) so Title Prepare/Apply, Meta Prepare/Apply, and
 * both rollback actions all report the exact same wording for the exact
 * same failure, and so it can live in a plain `server-only` module rather
 * than a `'use server'` Server Actions file — Next.js requires every export
 * from a `'use server'` file to itself be an async Server Action, which this
 * synchronous helper never was.
 */
export function mappingFailureMessage(mapping: Extract<ShopifyResourceMapping, { ok: false }>): string {
  switch (mapping.reason) {
    case 'homepage_unsupported':
      return 'webioom does not yet support direct fixes for a Shopify homepage.'
    case 'localized_route_unsupported':
      return 'This page appears to use a localized or market-specific storefront URL, which webioom does not yet support for direct fixes.'
    case 'unsupported_route':
    case 'invalid_url':
      return 'webioom does not recognize this page as a supported Shopify resource.'
    case 'domain_mismatch':
      return 'This page does not appear to belong to the connected Shopify store.'
    case 'resource_not_found':
      return 'webioom could not find a matching resource in your connected Shopify store.'
    case 'ambiguous_resource':
      return 'webioom found more than one possible match for this page and cannot safely proceed.'
    case 'unauthorized':
      return 'The connected Shopify store did not accept webioom’s access. Please reconnect Shopify.'
    case 'connection_error':
      return 'webioom could not reach the connected Shopify store right now. Please try again shortly.'
    case 'malformed_response':
      return 'The connected Shopify store returned an unexpected response.'
  }
}
