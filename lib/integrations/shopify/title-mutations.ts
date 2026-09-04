import 'server-only'
import { fetchShopifyGraphQL, type ShopifyGraphQLResult } from './client'

export type ShopifyTitleUpdateResult =
  | { status: 'success'; gid: string; title: string }
  | { status: 'failed'; reason: 'validation_failure' | 'permission_failure' | 'not_found' | 'malformed_response' | 'provider_error' }

function graphqlFailureToTitleUpdateResult(result: Extract<ShopifyGraphQLResult, { ok: false }>): ShopifyTitleUpdateResult {
  switch (result.reason) {
    case 'unauthorized':
      return { status: 'failed', reason: 'permission_failure' }
    case 'blocked':
    case 'timeout':
    case 'network':
      return { status: 'failed', reason: 'provider_error' }
    case 'malformed_response':
    case 'graphql_errors':
    case 'unexpected_status':
      return { status: 'failed', reason: 'malformed_response' }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * Maps Shopify's userErrors into safe internal categories without leaking
 * raw Shopify error text to the browser. A conservative substring check on
 * the (already-Shopify-controlled, never user-controlled) error message
 * text is used only to distinguish "this looks like a permission/scope
 * problem" from a generic validation failure — never to make an
 * authorization decision, which always comes from the fresh capability
 * check performed before this function is ever called.
 */
function classifyUserErrors(userErrors: ReadonlyArray<{ field?: unknown; message?: unknown }>): 'permission_failure' | 'validation_failure' {
  const looksLikePermission = userErrors.some((error) => typeof error.message === 'string' && /access|permission|scope/i.test(error.message))
  return looksLikePermission ? 'permission_failure' : 'validation_failure'
}

/**
 * Validates one mutation payload as untrusted external data — never
 * reports success on HTTP 200 alone. Confirms: the payload object exists,
 * `userErrors` is present in the expected array shape (non-empty fails),
 * the named resource field exists, and the returned GID/title EXACTLY
 * (byte-for-byte, no whitespace normalization — Shopify's title field is a
 * plain string with no equivalent to WordPress's kses reformatting) match
 * what was requested. Any deviation fails closed as 'malformed_response'
 * rather than being reported as success.
 */
function validateTitleMutationPayload(
  payload: unknown,
  resourceKey: string,
  expectedGid: string,
  expectedTitle: string
): ShopifyTitleUpdateResult {
  const payloadObj = asRecord(payload)
  if (!payloadObj) return { status: 'failed', reason: 'malformed_response' }

  const userErrors = payloadObj.userErrors
  if (!Array.isArray(userErrors)) return { status: 'failed', reason: 'malformed_response' }
  if (userErrors.length > 0) {
    return { status: 'failed', reason: classifyUserErrors(userErrors) }
  }

  const resource = asRecord(payloadObj[resourceKey])
  if (!resource) return { status: 'failed', reason: 'not_found' }

  const returnedGid = resource.id
  const returnedTitle = resource.title

  if (typeof returnedGid !== 'string' || typeof returnedTitle !== 'string') {
    return { status: 'failed', reason: 'malformed_response' }
  }
  if (returnedGid !== expectedGid || returnedTitle !== expectedTitle) {
    return { status: 'failed', reason: 'malformed_response' }
  }

  return { status: 'success', gid: returnedGid, title: returnedTitle }
}

// ---------------------------------------------------------------------------
// Product — id lives INSIDE ProductUpdateInput (confirmed against current
// docs: the `product: ProductUpdateInput` argument is the current,
// non-deprecated form; the older `input: ProductInput` argument is
// deprecated and never used here).
// ---------------------------------------------------------------------------

const PRODUCT_TITLE_MUTATION = `mutation WebioomUpdateProductTitle($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}`

/**
 * Updates ONLY the title of one specific, already-confirmed Shopify
 * Product. Accepts nothing beyond the exact server-derived GID and a
 * validated title — no other ProductUpdateInput field (description,
 * vendor, handle, status, tags, seo, metafields) is ever constructed or
 * accepted by this function's signature, making it structurally
 * impossible for a caller to smuggle in an unrelated field.
 */
export async function updateShopifyProductTitle(shopDomain: string, accessToken: string, gid: string, title: string): Promise<ShopifyTitleUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, PRODUCT_TITLE_MUTATION, {
    product: { id: gid, title },
  })
  if (!result.ok) return graphqlFailureToTitleUpdateResult(result)
  return validateTitleMutationPayload(result.data.productUpdate, 'product', gid, title)
}

// ---------------------------------------------------------------------------
// Collection — id lives INSIDE CollectionUpdateInput.
// ---------------------------------------------------------------------------

const COLLECTION_TITLE_MUTATION = `mutation WebioomUpdateCollectionTitle($collection: CollectionUpdateInput!) {
  collectionUpdate(collection: $collection) {
    collection {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}`

/** Updates ONLY the title of one specific, already-confirmed Shopify Collection — same field-only constraint as updateShopifyProductTitle. */
export async function updateShopifyCollectionTitle(shopDomain: string, accessToken: string, gid: string, title: string): Promise<ShopifyTitleUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, COLLECTION_TITLE_MUTATION, {
    collection: { id: gid, title },
  })
  if (!result.ok) return graphqlFailureToTitleUpdateResult(result)
  return validateTitleMutationPayload(result.data.collectionUpdate, 'collection', gid, title)
}

// ---------------------------------------------------------------------------
// Page — id is a SEPARATE top-level mutation argument, not nested inside
// PageUpdateInput (confirmed against current docs — a real structural
// difference from Product/Collection, not an oversight).
// ---------------------------------------------------------------------------

const PAGE_TITLE_MUTATION = `mutation WebioomUpdatePageTitle($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) {
    page {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}`

/** Updates ONLY the title of one specific, already-confirmed Shopify Page. */
export async function updateShopifyPageTitle(shopDomain: string, accessToken: string, gid: string, title: string): Promise<ShopifyTitleUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, PAGE_TITLE_MUTATION, {
    id: gid,
    page: { title },
  })
  if (!result.ok) return graphqlFailureToTitleUpdateResult(result)
  return validateTitleMutationPayload(result.data.pageUpdate, 'page', gid, title)
}

// ---------------------------------------------------------------------------
// Article — id is also a SEPARATE top-level mutation argument, matching
// Page's shape rather than Product/Collection's.
// ---------------------------------------------------------------------------

const ARTICLE_TITLE_MUTATION = `mutation WebioomUpdateArticleTitle($id: ID!, $article: ArticleUpdateInput!) {
  articleUpdate(id: $id, article: $article) {
    article {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}`

/** Updates ONLY the title of one specific, already-confirmed Shopify Article. */
export async function updateShopifyArticleTitle(shopDomain: string, accessToken: string, gid: string, title: string): Promise<ShopifyTitleUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, ARTICLE_TITLE_MUTATION, {
    id: gid,
    article: { title },
  })
  if (!result.ok) return graphqlFailureToTitleUpdateResult(result)
  return validateTitleMutationPayload(result.data.articleUpdate, 'article', gid, title)
}

/**
 * Same safe user-facing wording used by Title Apply and Title Undo — moved
 * here (from shopify-title-fix-actions.ts, a `'use server'` file, where a
 * synchronous, non-Server-Action export is not permitted) so both
 * shopify-title-fix-actions.ts and shopify-title-rollback-actions.ts can
 * import a single shared implementation from a plain `server-only` module.
 */
export function mutationFailureMessage(reason: Extract<ShopifyTitleUpdateResult, { status: 'failed' }>['reason']): string {
  switch (reason) {
    case 'permission_failure':
      return 'The connected Shopify store did not allow this update (permission denied).'
    case 'validation_failure':
      return 'Shopify rejected this title update.'
    case 'not_found':
      return 'This Shopify resource could not be found.'
    case 'provider_error':
      return 'Shopify could not be reached to apply this update. Please try again shortly.'
    case 'malformed_response':
      return 'Shopify’s response did not confirm the title was updated.'
  }
}
