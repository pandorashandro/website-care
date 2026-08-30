import 'server-only'
import { fetchShopifyGraphQL, type ShopifyGraphQLResult } from './client'

/**
 * Shopify does NOT expose meta description uniformly across resource
 * types (confirmed fresh against current official docs this phase):
 *
 * - Product and Collection have a first-class `seo { title, description }`
 *   object field, written via productUpdate/collectionUpdate's
 *   `seo: SEOInput` (fields: title, description — only `description` is
 *   ever sent here, see updateShopifyProductMetaDescription's doc comment).
 * - Page and Article have NO such field. Their SEO title/description is
 *   conventionally stored as `global.title_tag` / `global.description_tag`
 *   metafields, written via the current universal `metafieldsSet` mutation
 *   — never a resource-specific "SEO" field, because none exists for
 *   these two types.
 *
 * This is Shopify's own real bifurcation, analogous in spirit to
 * WordPress's write_strategy concept (proof of exactly which mechanism a
 * write used) but on a completely different axis (resource type, not
 * competing third-party plugins) — modeled here as `mechanism`, never
 * forced into one fake-unified shape across all four resource types.
 */
export type ShopifyMetaDescriptionMechanism = 'seo_object' | 'seo_metafield'

/** The exact, hard-coded, official Shopify SEO metafield identity for description on Page/Article — the ONLY namespace/key this module will ever read or write. Never accepted from any caller. */
const SEO_DESCRIPTION_METAFIELD_NAMESPACE = 'global'
const SEO_DESCRIPTION_METAFIELD_KEY = 'description_tag'

/**
 * Phase 20.1E-R correction: NO hard-coded fallback type exists here
 * anymore. Fresh research against current official Shopify documentation
 * produced genuinely CONFLICTING evidence for global.description_tag's
 * metafield type — one official page's own prose states "these metafields
 * ... have the single_line_text_field type" (referring to both title_tag
 * and description_tag together), while other corroborating sources
 * (including the same page's surrounding context) suggest description_tag
 * is specifically multi_line_text_field. Shopify's formal "standard
 * metafield definitions" list (the one place with an unambiguous, schema-
 * level type per key) does not include title_tag/description_tag at all —
 * these predate that system and have no canonical schema entry to check
 * against. Per this phase's explicit fail-closed instruction, a guessed
 * type is never used to CREATE a new metafield. When an existing
 * global.description_tag metafield is found, its own reported `type` is
 * used (authoritative, no guessing involved — see
 * readShopifyPageMetaDescription/readShopifyArticleMetaDescription).
 * When none exists yet, `metafieldType` is `null` and the orchestration
 * layer (shopify-meta-fix-actions.ts) must refuse to write rather than
 * invent a type.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

// ---------------------------------------------------------------------------
// Reading — authoritative for Prepare's initial value and Apply's drift
// comparison. seo_object results additionally carry `currentSeoTitle` —
// the freshly-read SEO title, needed so the write can echo it back
// unchanged (see updateShopifyProductMetaDescription's doc comment for
// why). seo_metafield results carry `metafieldType: string | null` — null
// means no metafield exists yet and its type cannot be safely proven; see
// the module doc comment above.
// ---------------------------------------------------------------------------

export type ShopifyMetaDescriptionReadResult =
  | { ok: true; mechanism: 'seo_object'; currentValue: string | null; currentSeoTitle: string | null }
  | { ok: true; mechanism: 'seo_metafield'; currentValue: string | null; metafieldType: string | null }
  | Extract<ShopifyGraphQLResult, { ok: false }>

const PRODUCT_SEO_QUERY = `query WebioomProductSeo($id: ID!) {
  product(id: $id) {
    seo {
      title
      description
    }
  }
}`

export async function readShopifyProductMetaDescription(shopDomain: string, accessToken: string, gid: string): Promise<ShopifyMetaDescriptionReadResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, PRODUCT_SEO_QUERY, { id: gid })
  if (!result.ok) return result

  const product = asRecord(result.data.product)
  if (!product) return { ok: false, reason: 'malformed_response' }

  const seo = asRecord(product.seo)
  const description = seo ? seo.description : null
  const title = seo ? seo.title : null
  if ((description !== null && description !== undefined && typeof description !== 'string') || (title !== null && title !== undefined && typeof title !== 'string')) {
    return { ok: false, reason: 'malformed_response' }
  }

  return {
    ok: true,
    mechanism: 'seo_object',
    currentValue: typeof description === 'string' ? description : null,
    currentSeoTitle: typeof title === 'string' ? title : null,
  }
}

const COLLECTION_SEO_QUERY = `query WebioomCollectionSeo($id: ID!) {
  collection(id: $id) {
    seo {
      title
      description
    }
  }
}`

export async function readShopifyCollectionMetaDescription(shopDomain: string, accessToken: string, gid: string): Promise<ShopifyMetaDescriptionReadResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, COLLECTION_SEO_QUERY, { id: gid })
  if (!result.ok) return result

  const collection = asRecord(result.data.collection)
  if (!collection) return { ok: false, reason: 'malformed_response' }

  const seo = asRecord(collection.seo)
  const description = seo ? seo.description : null
  const title = seo ? seo.title : null
  if ((description !== null && description !== undefined && typeof description !== 'string') || (title !== null && title !== undefined && typeof title !== 'string')) {
    return { ok: false, reason: 'malformed_response' }
  }

  return {
    ok: true,
    mechanism: 'seo_object',
    currentValue: typeof description === 'string' ? description : null,
    currentSeoTitle: typeof title === 'string' ? title : null,
  }
}

const PAGE_SEO_DESCRIPTION_QUERY = `query WebioomPageSeoDescription($id: ID!) {
  page(id: $id) {
    metafield(namespace: "${SEO_DESCRIPTION_METAFIELD_NAMESPACE}", key: "${SEO_DESCRIPTION_METAFIELD_KEY}") {
      value
      type
    }
  }
}`

export async function readShopifyPageMetaDescription(shopDomain: string, accessToken: string, gid: string): Promise<ShopifyMetaDescriptionReadResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, PAGE_SEO_DESCRIPTION_QUERY, { id: gid })
  if (!result.ok) return result

  const page = asRecord(result.data.page)
  if (!page) return { ok: false, reason: 'malformed_response' }

  const metafield = asRecord(page.metafield)
  if (!metafield) {
    // No metafield has ever been set — a real, valid, non-error state, not
    // a failure. There is no existing `type` to derive from, and per the
    // Phase 20.1E-R fail-closed rule, none is guessed — metafieldType is
    // null, signaling "cannot safely write yet" to the orchestration layer.
    return { ok: true, mechanism: 'seo_metafield', currentValue: null, metafieldType: null }
  }

  const value = metafield.value
  const type = metafield.type
  if (typeof value !== 'string' || typeof type !== 'string') {
    return { ok: false, reason: 'malformed_response' }
  }

  return { ok: true, mechanism: 'seo_metafield', currentValue: value, metafieldType: type }
}

const ARTICLE_SEO_DESCRIPTION_QUERY = `query WebioomArticleSeoDescription($id: ID!) {
  article(id: $id) {
    metafield(namespace: "${SEO_DESCRIPTION_METAFIELD_NAMESPACE}", key: "${SEO_DESCRIPTION_METAFIELD_KEY}") {
      value
      type
    }
  }
}`

export async function readShopifyArticleMetaDescription(shopDomain: string, accessToken: string, gid: string): Promise<ShopifyMetaDescriptionReadResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, ARTICLE_SEO_DESCRIPTION_QUERY, { id: gid })
  if (!result.ok) return result

  const article = asRecord(result.data.article)
  if (!article) return { ok: false, reason: 'malformed_response' }

  const metafield = asRecord(article.metafield)
  if (!metafield) {
    return { ok: true, mechanism: 'seo_metafield', currentValue: null, metafieldType: null }
  }

  const value = metafield.value
  const type = metafield.type
  if (typeof value !== 'string' || typeof type !== 'string') {
    return { ok: false, reason: 'malformed_response' }
  }

  return { ok: true, mechanism: 'seo_metafield', currentValue: value, metafieldType: type }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type ShopifyMetaDescriptionUpdateResult =
  | { status: 'success'; gid: string; value: string }
  | { status: 'failed'; reason: 'validation_failure' | 'permission_failure' | 'not_found' | 'malformed_response' | 'provider_error' }

function graphqlFailureToMetaUpdateResult(result: Extract<ShopifyGraphQLResult, { ok: false }>): ShopifyMetaDescriptionUpdateResult {
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

function classifyUserErrors(userErrors: ReadonlyArray<{ field?: unknown; message?: unknown }>): 'permission_failure' | 'validation_failure' {
  const looksLikePermission = userErrors.some((error) => typeof error.message === 'string' && /access|permission|scope/i.test(error.message))
  return looksLikePermission ? 'permission_failure' : 'validation_failure'
}

// --- Product / Collection: SEO object write ---------------------------------

const PRODUCT_SEO_DESCRIPTION_MUTATION = `mutation WebioomSetProductSeoDescription($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product {
      id
      seo {
        title
        description
      }
    }
    userErrors {
      field
      message
    }
  }
}`

/**
 * Updates product.seo.description while PROVABLY leaving seo.title
 * unchanged. Phase 20.1E-R correction: current official Shopify
 * documentation does not conclusively establish whether omitting `title`
 * from a nested `seo` input leaves the existing value untouched versus
 * clearing it (the one nearby documented precedent, `tags`, explicitly
 * documents full-replace semantics with a dedicated non-destructive
 * mutation for partial updates — there is no equivalent stated guarantee
 * for `seo`). Rather than rely on that unproven assumption, `currentTitle`
 * — the SEO title read moments earlier by the same caller, immediately
 * before this call — is always sent back explicitly. This makes the
 * operation provably a no-op for title REGARDLESS of whether Shopify's
 * update semantics are partial or full-replace: the field is never
 * omitted, it is always set to exactly the value it already had.
 * `currentTitle` must always be freshly read immediately before this
 * call, never a stale value carried from an earlier Prepare step — see
 * shopify-meta-fix-actions.ts, which always reads immediately before
 * writing, both at Prepare (unused) and Apply (used here).
 */
export async function updateShopifyProductMetaDescription(
  shopDomain: string,
  accessToken: string,
  gid: string,
  description: string,
  currentTitle: string | null
): Promise<ShopifyMetaDescriptionUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, PRODUCT_SEO_DESCRIPTION_MUTATION, {
    product: { id: gid, seo: { title: currentTitle, description } },
  })
  if (!result.ok) return graphqlFailureToMetaUpdateResult(result)

  const payload = asRecord(result.data.productUpdate)
  if (!payload) return { status: 'failed', reason: 'malformed_response' }

  const userErrors = payload.userErrors
  if (!Array.isArray(userErrors)) return { status: 'failed', reason: 'malformed_response' }
  if (userErrors.length > 0) return { status: 'failed', reason: classifyUserErrors(userErrors) }

  const product = asRecord(payload.product)
  if (!product) return { status: 'failed', reason: 'not_found' }

  const returnedGid = product.id
  const seo = asRecord(product.seo)
  const returnedValue = seo ? seo.description : undefined
  const returnedTitle = seo ? seo.title : undefined
  const normalizedReturnedTitle = typeof returnedTitle === 'string' ? returnedTitle : null

  if (typeof returnedGid !== 'string' || typeof returnedValue !== 'string') return { status: 'failed', reason: 'malformed_response' }
  if (returnedGid !== gid || returnedValue !== description) return { status: 'failed', reason: 'malformed_response' }
  // Direct proof the SEO title was NOT changed by this write.
  if (normalizedReturnedTitle !== currentTitle) return { status: 'failed', reason: 'malformed_response' }

  return { status: 'success', gid: returnedGid, value: returnedValue }
}

const COLLECTION_SEO_DESCRIPTION_MUTATION = `mutation WebioomSetCollectionSeoDescription($collection: CollectionUpdateInput!) {
  collectionUpdate(collection: $collection) {
    collection {
      id
      seo {
        title
        description
      }
    }
    userErrors {
      field
      message
    }
  }
}`

/** Updates collection.seo.description while PROVABLY leaving seo.title unchanged — same freshly-read-title-echo guarantee as updateShopifyProductMetaDescription; see that function's doc comment for the full reasoning. */
export async function updateShopifyCollectionMetaDescription(
  shopDomain: string,
  accessToken: string,
  gid: string,
  description: string,
  currentTitle: string | null
): Promise<ShopifyMetaDescriptionUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, COLLECTION_SEO_DESCRIPTION_MUTATION, {
    collection: { id: gid, seo: { title: currentTitle, description } },
  })
  if (!result.ok) return graphqlFailureToMetaUpdateResult(result)

  const payload = asRecord(result.data.collectionUpdate)
  if (!payload) return { status: 'failed', reason: 'malformed_response' }

  const userErrors = payload.userErrors
  if (!Array.isArray(userErrors)) return { status: 'failed', reason: 'malformed_response' }
  if (userErrors.length > 0) return { status: 'failed', reason: classifyUserErrors(userErrors) }

  const collection = asRecord(payload.collection)
  if (!collection) return { status: 'failed', reason: 'not_found' }

  const returnedGid = collection.id
  const seo = asRecord(collection.seo)
  const returnedValue = seo ? seo.description : undefined
  const returnedTitle = seo ? seo.title : undefined
  const normalizedReturnedTitle = typeof returnedTitle === 'string' ? returnedTitle : null

  if (typeof returnedGid !== 'string' || typeof returnedValue !== 'string') return { status: 'failed', reason: 'malformed_response' }
  if (returnedGid !== gid || returnedValue !== description) return { status: 'failed', reason: 'malformed_response' }
  if (normalizedReturnedTitle !== currentTitle) return { status: 'failed', reason: 'malformed_response' }

  return { status: 'success', gid: returnedGid, value: returnedValue }
}

// --- Page / Article: SEO metafield write, via the universal metafieldsSet --
// The browser/caller never supplies namespace/key/type/ownerId — all four
// are fixed by server-side policy (namespace/key are hard-coded constants
// above; ownerId is the already-server-confirmed resource GID; type is
// re-derived fresh from a prior read, see meta-fix-actions.ts). Only
// `description`/`gid`/`metafieldType` are accepted as parameters, and
// `metafieldType` must already have come from this module's own reader —
// nothing else in the codebase constructs it.

function ownerGidFromMetafieldResponse(metafieldRecord: Record<string, unknown>): string | null {
  const owner = asRecord(metafieldRecord.owner)
  const ownerId = owner ? owner.id : null
  return typeof ownerId === 'string' ? ownerId : null
}

const SET_PAGE_SEO_DESCRIPTION_MUTATION = `mutation WebioomSetPageSeoDescription($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      value
      owner {
        ... on Page {
          id
        }
      }
    }
    userErrors {
      field
      message
      code
    }
  }
}`

/**
 * Updates ONLY the global.description_tag metafield on one specific,
 * already-confirmed Shopify Page. Proves owner identity directly in the
 * SAME response via `owner { ... on Page { id } }` — confirmed against
 * current docs to be a real, queryable field on Metafield — rather than
 * requiring a separate read-back call, per this phase's explicit
 * requirement to fail closed or prove identity strongly enough.
 */
export async function updateShopifyPageMetaDescription(
  shopDomain: string,
  accessToken: string,
  gid: string,
  description: string,
  metafieldType: string
): Promise<ShopifyMetaDescriptionUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, SET_PAGE_SEO_DESCRIPTION_MUTATION, {
    metafields: [{ ownerId: gid, namespace: SEO_DESCRIPTION_METAFIELD_NAMESPACE, key: SEO_DESCRIPTION_METAFIELD_KEY, type: metafieldType, value: description }],
  })
  if (!result.ok) return graphqlFailureToMetaUpdateResult(result)

  const payload = asRecord(result.data.metafieldsSet)
  if (!payload) return { status: 'failed', reason: 'malformed_response' }

  const userErrors = payload.userErrors
  if (!Array.isArray(userErrors)) return { status: 'failed', reason: 'malformed_response' }
  if (userErrors.length > 0) return { status: 'failed', reason: classifyUserErrors(userErrors) }

  const metafields = payload.metafields
  if (!Array.isArray(metafields) || metafields.length !== 1) return { status: 'failed', reason: 'malformed_response' }

  const metafield = asRecord(metafields[0])
  if (!metafield) return { status: 'failed', reason: 'malformed_response' }

  const returnedValue = metafield.value
  const ownerGid = ownerGidFromMetafieldResponse(metafield)

  if (typeof returnedValue !== 'string' || returnedValue !== description) return { status: 'failed', reason: 'malformed_response' }
  if (ownerGid !== gid) return { status: 'failed', reason: 'malformed_response' }

  return { status: 'success', gid, value: returnedValue }
}

const SET_ARTICLE_SEO_DESCRIPTION_MUTATION = `mutation WebioomSetArticleSeoDescription($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      value
      owner {
        ... on Article {
          id
        }
      }
    }
    userErrors {
      field
      message
      code
    }
  }
}`

/** Updates ONLY the global.description_tag metafield on one specific, already-confirmed Shopify Article — same owner-identity-proof guarantee as updateShopifyPageMetaDescription. */
export async function updateShopifyArticleMetaDescription(
  shopDomain: string,
  accessToken: string,
  gid: string,
  description: string,
  metafieldType: string
): Promise<ShopifyMetaDescriptionUpdateResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, SET_ARTICLE_SEO_DESCRIPTION_MUTATION, {
    metafields: [{ ownerId: gid, namespace: SEO_DESCRIPTION_METAFIELD_NAMESPACE, key: SEO_DESCRIPTION_METAFIELD_KEY, type: metafieldType, value: description }],
  })
  if (!result.ok) return graphqlFailureToMetaUpdateResult(result)

  const payload = asRecord(result.data.metafieldsSet)
  if (!payload) return { status: 'failed', reason: 'malformed_response' }

  const userErrors = payload.userErrors
  if (!Array.isArray(userErrors)) return { status: 'failed', reason: 'malformed_response' }
  if (userErrors.length > 0) return { status: 'failed', reason: classifyUserErrors(userErrors) }

  const metafields = payload.metafields
  if (!Array.isArray(metafields) || metafields.length !== 1) return { status: 'failed', reason: 'malformed_response' }

  const metafield = asRecord(metafields[0])
  if (!metafield) return { status: 'failed', reason: 'malformed_response' }

  const returnedValue = metafield.value
  const ownerGid = ownerGidFromMetafieldResponse(metafield)

  if (typeof returnedValue !== 'string' || returnedValue !== description) return { status: 'failed', reason: 'malformed_response' }
  if (ownerGid !== gid) return { status: 'failed', reason: 'malformed_response' }

  return { status: 'success', gid, value: returnedValue }
}
