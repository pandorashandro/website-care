import 'server-only'
import { fetchWixApi } from './client'

/**
 * The two item types Prompt 1's resource mapping can prove identity for —
 * see lib/integrations/wix/resource-mapping.ts's WixResourceFamily. This
 * module's own item-type parameter is typed against the literal Wix API
 * values (`BLOG_POST`/`STORES_PRODUCT`) rather than that lowercase-snake
 * union, since it talks to the Item SEO Tags API directly; callers map
 * between the two (see wix-title-fix-actions.ts).
 */
export type WixSeoItemType = 'BLOG_POST' | 'STORES_PRODUCT'

/**
 * A single SEO tag as the Item SEO Tags API represents it. Deliberately
 * NOT a full re-typing of Wix's `Tag` message — only the fields this
 * module's readers/writers actually touch (`type`, `props`, `children`).
 * `meta`/`custom`/`disabled` are preserved verbatim (read → write) without
 * this module needing to understand their semantics, exactly as an
 * unrelated tag must be preserved exactly.
 */
export type WixSeoTag = {
  type: string
  props?: Record<string, unknown>
  children?: string
  meta?: Record<string, unknown>
  custom?: boolean
  disabled?: boolean
}

export type WixResolvedSeoTag = { tag: WixSeoTag; source: string }

export type WixItemSeoTagsReadResult =
  | {
      ok: true
      ownTags: WixSeoTag[]
      resolvedTags: WixResolvedSeoTag[]
      /**
       * The language the item's own tags apply to, as Wix reports it —
       * `null` when unset (which the API treats as "the site's primary
       * language" per its own docs: "Tags can currently be written only
       * for the item's primary language"). Callers compare this against
       * lib/integrations/wix/site-identity.ts's primaryLanguageCode to
       * decide whether a write is safe — see
       * evaluateWixFixCapability's `language_not_supported` outcome.
       */
      language: string | null
    }
  | { ok: false; reason: 'not_found' | 'unauthorized' | 'forbidden' | 'connection_error' | 'malformed_response' }

function parseWixSeoTag(raw: unknown): WixSeoTag | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.type !== 'string') return null

  return {
    type: r.type,
    props: r.props && typeof r.props === 'object' ? (r.props as Record<string, unknown>) : undefined,
    children: typeof r.children === 'string' ? r.children : undefined,
    meta: r.meta && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>) : undefined,
    custom: typeof r.custom === 'boolean' ? r.custom : undefined,
    disabled: typeof r.disabled === 'boolean' ? r.disabled : undefined,
  }
}

/**
 * Reads one item's SEO tags — both its OWN tags (`ownTags`, what the item
 * would need re-sent in full on any write — see Set Item SEO Tags'
 * documented full-replacement semantics) and the tags it actually renders
 * with (`resolvedTags`, accounting for inheritance from site/pattern/host
 * page — see docs/wix-api-research.md §6/§7). Both Prepare and Apply call
 * this fresh, immediately before making any decision — never cached,
 * never reused across a request boundary, minimizing the TOCTOU window
 * described in this phase's drift-handling design (no ETag/revision field
 * exists on this API — confirmed by inspecting its full schema).
 */
export async function readWixItemSeoTags(accessToken: string, itemType: WixSeoItemType, itemId: string): Promise<WixItemSeoTagsReadResult> {
  const result = await fetchWixApi(`/promote/seo/v1/item-seo-tags/${itemType}/${encodeURIComponent(itemId)}`, accessToken)

  if (!result.ok) {
    if (result.reason === 'not_found') return { ok: false, reason: 'not_found' }
    if (result.reason === 'unauthorized') return { ok: false, reason: 'unauthorized' }
    if (result.reason === 'forbidden') return { ok: false, reason: 'forbidden' }
    if (result.reason === 'malformed_response') return { ok: false, reason: 'malformed_response' }
    return { ok: false, reason: 'connection_error' }
  }

  const itemSeoTags = result.data.itemSeoTags
  if (!itemSeoTags || typeof itemSeoTags !== 'object') return { ok: false, reason: 'malformed_response' }
  const obj = itemSeoTags as Record<string, unknown>

  const rawTags = obj.tags
  if (!Array.isArray(rawTags)) return { ok: false, reason: 'malformed_response' }

  const ownTags: WixSeoTag[] = []
  for (const raw of rawTags) {
    const tag = parseWixSeoTag(raw)
    if (!tag) return { ok: false, reason: 'malformed_response' }
    ownTags.push(tag)
  }

  const resolvedTags: WixResolvedSeoTag[] = []
  const rawResolved = obj.resolvedTags
  if (Array.isArray(rawResolved)) {
    for (const rawEntry of rawResolved) {
      if (!rawEntry || typeof rawEntry !== 'object') continue
      const entryObj = rawEntry as Record<string, unknown>
      const tag = parseWixSeoTag(entryObj.tag)
      if (!tag) continue
      resolvedTags.push({ tag, source: typeof entryObj.source === 'string' ? entryObj.source : 'TAG_SOURCE_UNSPECIFIED' })
    }
  }

  const language = typeof obj.language === 'string' ? obj.language : null

  return { ok: true, ownTags, resolvedTags, language }
}

/** The value an item is expected to RENDER with (accounting for inheritance) — what a scanner/visitor actually sees, and what Prepare/Apply treat as "current value" for drift comparison. */
export function extractResolvedTitle(resolvedTags: WixResolvedSeoTag[]): string | null {
  const entry = resolvedTags.find((r) => r.tag.type === 'title')
  return entry?.tag.children ?? null
}

/** Same as extractResolvedTitle, for the meta-description tag (`type: 'meta'`, `props.name === 'description'`). */
export function extractResolvedMetaDescription(resolvedTags: WixResolvedSeoTag[]): string | null {
  const entry = resolvedTags.find((r) => r.tag.type === 'meta' && r.tag.props?.name === 'description')
  const content = entry?.tag.props?.content
  return typeof content === 'string' ? content : null
}

export type WixSeoTagsUpdateResult =
  | { status: 'success'; itemId: string; tags: WixSeoTag[] }
  | { status: 'failed'; reason: 'validation_failure' | 'not_found' | 'permission_failure' | 'provider_error' | 'malformed_response' }

/**
 * Replaces every tag of the given predicate's type with `newTag`, keeping
 * every other tag byte-for-byte as read — this is the ENTIRE
 * "preserve unrelated tags" mechanism this phase's brief requires, made
 * necessary by Set Item SEO Tags' documented full-array-replacement
 * semantics ("Setting `tags` replaces the item's tags in full, so send
 * the complete set you want the item to have").
 */
/**
 * Exported (Wix V1 Prompt 2) purely so this pure, deterministic
 * unrelated-tag-preservation logic has direct permanent test coverage
 * (tests/wix-seo-tags.test.ts) without needing to mock a network call.
 * This does NOT grant any write capability on its own — it never calls
 * the network; only setItemSeoTagsField (private, unexported) does that,
 * and every caller of it is one of the four narrow public writers below.
 */
export function replaceTagOfType(ownTags: WixSeoTag[], matches: (tag: WixSeoTag) => boolean, newTag: WixSeoTag): WixSeoTag[] {
  return [...ownTags.filter((tag) => !matches(tag)), newTag]
}

export function isTitleTag(tag: WixSeoTag): boolean {
  return tag.type === 'title'
}

export function isMetaDescriptionTag(tag: WixSeoTag): boolean {
  return tag.type === 'meta' && tag.props?.name === 'description'
}

/**
 * PRIVATE. The one low-level PATCH call every one of the four public
 * writers below funnels through — never exported, so the application
 * layer can never construct or send an arbitrary tag array (see this
 * phase's brief §9: no `writeSeoTag(type, value)`/`updateTags(tags)`
 * surface). `tags` here is always the caller's freshly-read `ownTags`
 * with exactly one entry replaced via replaceTagOfType — never
 * client-influenced, never AI-influenced beyond the single validated text
 * value it carries.
 */
async function setItemSeoTagsField(
  accessToken: string,
  itemType: WixSeoItemType,
  itemId: string,
  tags: WixSeoTag[]
): Promise<WixSeoTagsUpdateResult> {
  const result = await fetchWixApi(`/promote/seo/v1/item-seo-tags/${itemType}/${encodeURIComponent(itemId)}`, accessToken, {
    method: 'PATCH',
    body: { itemSeoTags: { tags }, fieldMask: 'tags' },
  })

  if (!result.ok) {
    if (result.reason === 'invalid_request') return { status: 'failed', reason: 'validation_failure' }
    if (result.reason === 'not_found') return { status: 'failed', reason: 'not_found' }
    if (result.reason === 'unauthorized' || result.reason === 'forbidden') return { status: 'failed', reason: 'permission_failure' }
    if (result.reason === 'malformed_response') return { status: 'failed', reason: 'malformed_response' }
    return { status: 'failed', reason: 'provider_error' }
  }

  const itemSeoTags = result.data.itemSeoTags
  if (!itemSeoTags || typeof itemSeoTags !== 'object') return { status: 'failed', reason: 'malformed_response' }
  const obj = itemSeoTags as Record<string, unknown>

  const returnedItemId = obj.itemId
  const rawTags = obj.tags
  if (typeof returnedItemId !== 'string' || !Array.isArray(rawTags)) return { status: 'failed', reason: 'malformed_response' }

  const returnedTags: WixSeoTag[] = []
  for (const raw of rawTags) {
    const tag = parseWixSeoTag(raw)
    if (!tag) return { status: 'failed', reason: 'malformed_response' }
    returnedTags.push(tag)
  }

  // Response validation: the returned item must be the exact same item we
  // targeted — never trust a response body without confirming it actually
  // describes the resource we asked to change.
  if (returnedItemId !== itemId) {
    return { status: 'failed', reason: 'malformed_response' }
  }

  return { status: 'success', itemId: returnedItemId, tags: returnedTags }
}

/**
 * Response-validating wrapper shared by all four public writers: confirms
 * the specific tag we intended to write is actually present, with the
 * exact value we sent, in the provider's own response — never reports
 * success from the mutation's HTTP status alone.
 */
async function writeSingleTag(
  accessToken: string,
  itemType: WixSeoItemType,
  itemId: string,
  currentOwnTags: WixSeoTag[],
  newTag: WixSeoTag,
  matches: (tag: WixSeoTag) => boolean,
  expectedValue: string,
  extractValue: (tag: WixSeoTag) => string | undefined
): Promise<WixSeoTagsUpdateResult> {
  const nextTags = replaceTagOfType(currentOwnTags, matches, newTag)
  const result = await setItemSeoTagsField(accessToken, itemType, itemId, nextTags)

  if (result.status !== 'success') return result

  const written = result.tags.find(matches)
  if (!written || extractValue(written) !== expectedValue) {
    return { status: 'failed', reason: 'malformed_response' }
  }

  return result
}

/** Constrained public writer #1 of 4: Blog Post title only. */
export async function updateWixBlogPostTitle(
  accessToken: string,
  itemId: string,
  currentOwnTags: WixSeoTag[],
  newTitle: string
): Promise<WixSeoTagsUpdateResult> {
  return writeSingleTag(accessToken, 'BLOG_POST', itemId, currentOwnTags, { type: 'title', children: newTitle }, isTitleTag, newTitle, (t) => t.children)
}

/** Constrained public writer #2 of 4: Stores Product title only. */
export async function updateWixStoresProductTitle(
  accessToken: string,
  itemId: string,
  currentOwnTags: WixSeoTag[],
  newTitle: string
): Promise<WixSeoTagsUpdateResult> {
  return writeSingleTag(accessToken, 'STORES_PRODUCT', itemId, currentOwnTags, { type: 'title', children: newTitle }, isTitleTag, newTitle, (t) => t.children)
}

/** Constrained public writer #3 of 4: Blog Post meta description only. */
export async function updateWixBlogPostMetaDescription(
  accessToken: string,
  itemId: string,
  currentOwnTags: WixSeoTag[],
  newDescription: string
): Promise<WixSeoTagsUpdateResult> {
  return writeSingleTag(
    accessToken,
    'BLOG_POST',
    itemId,
    currentOwnTags,
    { type: 'meta', props: { name: 'description', content: newDescription } },
    isMetaDescriptionTag,
    newDescription,
    (t) => (typeof t.props?.content === 'string' ? (t.props.content as string) : undefined)
  )
}

/** Constrained public writer #4 of 4: Stores Product meta description only. */
export async function updateWixStoresProductMetaDescription(
  accessToken: string,
  itemId: string,
  currentOwnTags: WixSeoTag[],
  newDescription: string
): Promise<WixSeoTagsUpdateResult> {
  return writeSingleTag(
    accessToken,
    'STORES_PRODUCT',
    itemId,
    currentOwnTags,
    { type: 'meta', props: { name: 'description', content: newDescription } },
    isMetaDescriptionTag,
    newDescription,
    (t) => (typeof t.props?.content === 'string' ? (t.props.content as string) : undefined)
  )
}
