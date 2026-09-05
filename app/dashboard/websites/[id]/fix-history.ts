import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { PlatformType, FixHistoryPlatform } from '@/lib/integrations/platform'

export type FixHistoryInsertInput = {
  websiteId: string
  /**
   * The exact platform this write/rollback was performed against — always
   * the caller's own typed platform identity constant (e.g.
   * lib/integrations/wordpress/adapter.ts's WORDPRESS_PLATFORM, or
   * lib/integrations/shopify/platform.ts's SHOPIFY_PLATFORM, added Phase
   * 20.1F), never a bare string literal re-typed at the call site. This
   * module deliberately has no WordPress- or Shopify-specific IMPORT of its
   * own beyond this type (it stays platform-agnostic core) — it only knows
   * the FixHistoryPlatform vocabulary and faithfully stores whatever typed
   * value each platform's own orchestration provides. FixHistoryPlatform
   * (not the narrower PlatformType) is used deliberately here — see that
   * type's doc comment in lib/integrations/platform.ts.
   */
  platform: FixHistoryPlatform
  issueTitle: string
  pageUrl: string
  /** Only ever populated for field: 'image_alt' — the trusted, server-derived image URL this row's write/rollback targeted. Null for every other field. */
  imageUrl?: string | null
  /**
   * The exact write mechanism actually used for this row's write — never
   * from browser/AI input, always taken from the freshly revalidated
   * server-side detection performed during Apply:
   *   - field: 'image_alt' -> one of the three image-alt strategies, from
   *     detectImageAltSource.
   *   - field: 'meta_description' -> one of the two SEO-provider strategies
   *     (Phase 19.5B-S), from the freshly re-detected SEO provider — see
   *     lib/integrations/wordpress/adapter.ts's
   *     toMetaDescriptionWriteStrategy. Existing rows written before this
   *     phase have no value here (null) and are deliberately treated as not
   *     rollback-eligible — see isRollbackEligibleByShape.
   *   - Null for every other field (title, h1), which only ever have one
   *     possible write mechanism.
   */
  writeStrategy?:
    | 'media_alt_text'
    | 'gutenberg_content_alt'
    | 'classic_html_alt'
    | 'yoast_meta_description'
    | 'rank_math_meta_description'
    | null
  /**
   * Phase 20.1F widened this from WordPress's original 'page' | 'post' to
   * also accept Shopify's four resource families; Wix V1 Prompt 2 widens
   * it again to add Wix's two resource families ('blog_post',
   * 'stores_product'). 'page' is a deliberate name collision between
   * WordPress and Shopify (a WordPress Page and a Shopify Page are
   * unrelated resource kinds) — this is safe ONLY because every
   * rollback-eligibility check in this file gates on `platform` FIRST,
   * before ever branching on `resourceType` (see isRollbackEligibleByShape,
   * isShopifyRollbackEligibleByShape, and isWixRollbackEligibleByShape
   * below).
   */
  resourceType: 'page' | 'post' | 'product' | 'collection' | 'article' | 'blog_post' | 'stores_product'
  /**
   * The WordPress numeric post/page ID. Phase 20.1F relaxes this to
   * `number | null` — null for every Shopify or Wix row, neither of which
   * has a numeric identity and instead populates `resourceGid`. Every
   * existing WordPress call site already passes a real number here, so
   * this relaxation changes nothing about WordPress's own behavior.
   */
  resourceId: number | null
  /**
   * Phase 20.1F: the canonical Shopify Admin GraphQL GID (e.g.
   * "gid://shopify/Product/123..."), populated for Shopify rows. Wix V1
   * Prompt 2 reuses this same column for Wix's item GUID (e.g.
   * "c1dmp") — a plain string identifier, not a GID URI, but the column
   * itself is untyped `text` with no format constraint beyond "a string
   * identity for a non-numeric-ID platform," which both shapes fit
   * equally well. Always null for WordPress rows, which use `resourceId`
   * instead.
   */
  resourceGid?: string | null
  field: 'title' | 'meta_description' | 'h1' | 'image_alt'
  previousValue: string | null
  appliedValue: string
  verificationStatus: string
}

export type FixHistoryInsertResult = 'saved' | 'failed'

/**
 * Records a durable audit row for one already-completed, already-confirmed
 * platform write or rollback (today, always WordPress — see the `platform`
 * field doc comment above). This is an internal helper, not a Server
 * Action — it is reachable only from inside each fix family's own
 * apply/rollback action, after ownership, capability, and platform response
 * validation have all already passed, so every value here (including
 * `platform` itself) is server-derived rather than accepted fresh from the
 * browser. A failure here never implies (and must never be reported as) the
 * underlying platform write having failed — the external change already
 * happened regardless.
 */
export async function recordFixHistory(input: FixHistoryInsertInput): Promise<FixHistoryInsertResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('fix_history').insert({
      website_id: input.websiteId,
      issue_title: input.issueTitle,
      page_url: input.pageUrl,
      image_url: input.imageUrl ?? null,
      write_strategy: input.writeStrategy ?? null,
      platform: input.platform,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      resource_gid: input.resourceGid ?? null,
      field: input.field,
      previous_value: input.previousValue,
      applied_value: input.appliedValue,
      verification_status: input.verificationStatus,
    })

    return error ? 'failed' : 'saved'
  } catch {
    return 'failed'
  }
}

export type FixHistoryRecord = {
  id: string
  issue_title: string
  page_url: string
  /** Only ever non-null for field='image_alt' rows. */
  image_url: string | null
  /**
   * Non-null for field='image_alt' rows (one of 'media_alt_text' |
   * 'gutenberg_content_alt' | 'classic_html_alt') and, since Phase 19.5B-S,
   * for field='meta_description' rows written from this point forward (one
   * of 'yoast_meta_description' | 'rank_math_meta_description'). Null for
   * every other field, and null for meta_description rows written before
   * 19.5B-S — see isRollbackEligibleByShape for how that legacy gap is
   * handled (fails closed, never guessed).
   */
  write_strategy: string | null
  platform: string
  resource_type: string | null
  resource_id: number | null
  /** Phase 20.1F — canonical Shopify Admin GID. Always null for WordPress rows. */
  resource_gid: string | null
  field: string
  previous_value: string | null
  applied_value: string
  verification_status: string
  created_at: string
}

const RECENT_FIXES_LIMIT = 10

const FIX_HISTORY_COLUMNS =
  'id, issue_title, page_url, image_url, write_strategy, platform, resource_type, resource_id, resource_gid, field, previous_value, applied_value, verification_status, created_at'

/**
 * Read-only, for display in the report's "Recent Fixes" widget and the
 * dedicated Activity page. Selects an explicit column list (never
 * `select('*')`) and relies on the same ownership check the calling page
 * already performed on `websiteId` before rendering, with RLS as the
 * enforced second layer underneath. `limit` defaults to the original
 * compact widget size; the Activity page passes a larger value — this is a
 * read-side convenience only, not a change to what's stored or how.
 */
export async function getRecentFixHistory(
  websiteId: string,
  limit: number = RECENT_FIXES_LIMIT
): Promise<FixHistoryRecord[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fix_history')
    .select(FIX_HISTORY_COLUMNS)
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<FixHistoryRecord[]>()

  if (error || !data) return []
  return data
}

/**
 * Loads exactly one fix_history row, scoped to BOTH its id and the given
 * (already ownership-verified) website — a row belonging to a different
 * website can never be returned, regardless of what id is requested. Used as
 * the trusted source of truth for rollback: the browser may only ever
 * reference a history row by opaque id, never supply the restore value,
 * resource id, or resource type directly.
 */
export async function getFixHistoryRowForRollback(
  websiteId: string,
  fixHistoryId: string
): Promise<FixHistoryRecord | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fix_history')
    .select(FIX_HISTORY_COLUMNS)
    .eq('id', fixHistoryId)
    .eq('website_id', websiteId)
    .maybeSingle()
    .returns<FixHistoryRecord>()

  if (error || !data) return null
  return data
}

/**
 * Shape-only rollback eligibility, independent of current WordPress state.
 * This is the single source of truth for "can this row even be considered
 * for rollback" — used both to decide whether the UI shows an Undo button
 * and, authoritatively, as the server-side gate before any rollback write is
 * attempted, so the two can never drift apart. A null previous_value is
 * deliberately treated as ineligible for either field: it is ambiguous
 * whether it represents a genuinely empty title/meta description (safe to
 * restore) or a value that simply couldn't be read from WordPress at fix
 * time (unsafe to guess), so it is left unsupported rather than guessed at.
 * h1 rollback re-detects the content source and reconstructs the exact
 * expected inserted markup fresh at rollback time (see
 * wordpress-h1-rollback-actions.ts) — this function only gates whether a
 * row is even the *shape* of something rollback-eligible; the real proof
 * of reversibility happens live, in the rollback action itself.
 *
 * image_alt follows a related but slightly different philosophy: mediaId is
 * never stored, and is re-detected fresh at rollback time from page_url +
 * image_url (see wordpress-image-alt-rollback-actions.ts) — never trusted
 * historically. image_url and write_strategy, however, ARE stored, because
 * neither can be safely re-derived from nothing: image_url is WHICH image on
 * the page was targeted, and write_strategy is proof that a fresh
 * detectImageAltSource result at rollback time is describing the SAME
 * editable source Apply actually used, not merely *a* still-supported source
 * (WordPress rendering/content structure can legitimately change over time
 * in a way that would make a different strategy newly "supported" for the
 * same image — rolling back through a different strategy than the one that
 * wrote the value would violate exact rollback semantics). A null image_url
 * or a write_strategy outside the three valid image-alt values makes an
 * image_alt row shape-ineligible, exactly like a null previous_value already
 * does for every field.
 *
 * meta_description (Phase 19.5B-S) follows the same philosophy as image_alt,
 * for the same reason: which SEO provider/field a fix actually wrote to is
 * not safely re-derivable from nothing, because a *different* provider can
 * legitimately become the one currently active for the same page over time
 * (a plugin switch), and rolling back through a different provider's field
 * than the one Apply actually wrote would violate exact rollback semantics
 * — see wordpress-meta-rollback-actions.ts for the live same-mechanism
 * proof this shape check exists to support. A write_strategy outside the
 * two valid meta_description values (including null, which is what every
 * row written before this phase has) makes a meta_description row
 * shape-ineligible. This is a deliberate behavior change for pre-existing
 * rows: a meta_description fix applied before Phase 19.5B-S is no longer
 * offered for Undo, because webioom can no longer prove which SEO field it
 * used — failing closed rather than guessing.
 */
const IMAGE_ALT_WRITE_STRATEGIES = new Set(['media_alt_text', 'gutenberg_content_alt', 'classic_html_alt'])
const META_DESCRIPTION_WRITE_STRATEGIES = new Set(['yoast_meta_description', 'rank_math_meta_description'])

/**
 * Platform-compatibility gate for rollback, kept as a single named source of
 * truth rather than a bare string comparison. `Record<PlatformType, boolean>`
 * is deliberate: if PlatformType ever gains a new member, this object
 * literal fails to type-check until an explicit true/false decision is made
 * for that platform too, so a future platform can never be silently treated
 * as rollback-compatible (or incompatible) by omission. This is an allowlist
 * check, not a dispatcher — it says nothing about HOW to roll a platform
 * back, only whether this row's platform is one any current rollback
 * implementation is entitled to touch. Every fix-family rollback action
 * (wordpress-*-rollback-actions.ts) reverses WordPress content specifically;
 * a row from any other/unknown platform value must fail closed here rather
 * than be guessed at downstream.
 *
 * `shopify: false`/`wix: false` are deliberate, explicit statements, not
 * stale placeholders: they mean "this WordPress-specific eligibility
 * function is not the one that governs Shopify/Wix rows" — NOT "Shopify/
 * Wix have no rollback support." Both platforms' rows ARE
 * rollback-eligible, but through their own, genuinely separate predicates
 * (isShopifyRollbackEligibleByShape, isWixRollbackEligibleByShape, below),
 * because each platform's resource_type vocabulary and identity column
 * (resource_gid, a plain string identifier) are structurally different
 * from WordPress's (numeric resource_id) — folding them into one
 * function/one allowlist would either force them through WordPress-shaped
 * checks that don't apply, or weaken WordPress's own numeric-resource_id
 * assumption. Every caller must therefore branch on `platform` FIRST and
 * call the matching eligibility function for that platform (see
 * ActivityItem in components/activity/activity-item.tsx) — this Record
 * only ever gates WordPress's own isRollbackEligibleByShape below, never
 * Shopify or Wix rows.
 */
const ROLLBACK_COMPATIBLE_PLATFORMS: Record<PlatformType, boolean> = { wordpress: true, shopify: false, wix: false }

function isRollbackCompatiblePlatform(platform: string): platform is PlatformType {
  return Object.prototype.hasOwnProperty.call(ROLLBACK_COMPATIBLE_PLATFORMS, platform) && ROLLBACK_COMPATIBLE_PLATFORMS[platform as PlatformType]
}

export function isRollbackEligibleByShape(
  row: Pick<
    FixHistoryRecord,
    'platform' | 'field' | 'resource_type' | 'resource_id' | 'previous_value' | 'image_url' | 'write_strategy'
  >
): boolean {
  if (!isRollbackCompatiblePlatform(row.platform)) return false
  if (row.field !== 'title' && row.field !== 'meta_description' && row.field !== 'h1' && row.field !== 'image_alt') {
    return false
  }
  if (row.resource_type !== 'page' && row.resource_type !== 'post') return false
  if (typeof row.resource_id !== 'number') return false
  if (row.previous_value === null) return false
  if (row.field === 'meta_description') {
    if (!row.write_strategy || !META_DESCRIPTION_WRITE_STRATEGIES.has(row.write_strategy)) return false
  }
  if (row.field === 'image_alt') {
    if (!row.image_url || typeof row.image_url !== 'string') return false
    if (!row.write_strategy || !IMAGE_ALT_WRITE_STRATEGIES.has(row.write_strategy)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Shopify (Phase 20.1F)
// ---------------------------------------------------------------------------

const SHOPIFY_ROLLBACK_RESOURCE_TYPES = new Set(['product', 'collection', 'page', 'article'])

/**
 * Shape-only rollback eligibility for Shopify rows — the Shopify analogue of
 * isRollbackEligibleByShape above, kept as a genuinely SEPARATE predicate
 * rather than folded into it. Shopify's resource_type vocabulary
 * (product/collection/page/article) and identity column (`resource_gid`, a
 * string GID) are structurally different from WordPress's (page/post +
 * numeric `resource_id`), and 'page' is a deliberate name collision between
 * the two platforms' resource_type values (see FixHistoryRecord's doc
 * comment) — this function's own `row.platform !== 'shopify'` check, run
 * FIRST, is what makes that collision safe: a WordPress 'page' row can never
 * reach the resource_type/resource_gid checks below, and a Shopify 'page'
 * row can never reach isRollbackEligibleByShape's numeric resource_id check.
 *
 * Only 'title' and 'meta_description' are ever eligible — Shopify has no
 * direct h1 or image_alt fix family (see
 * lib/integrations/shopify/capabilities.ts's ShopifyFixFamily, which is not
 * even the same type as WordPress's field vocabulary).
 *
 * A null previous_value is rejected for the same reason WordPress's version
 * rejects it: ambiguous between "genuinely observed as empty" and "could not
 * be read at fix time," never guessed at here. In practice neither current
 * Shopify Title nor Meta Description Apply flow (Phase 20.1D/20.1E) ever
 * records a null previous_value — both coerce a missing/null remote value to
 * '' before recording it — so this is a defense-in-depth floor, not an
 * expected trigger.
 */
export function isShopifyRollbackEligibleByShape(
  row: Pick<FixHistoryRecord, 'platform' | 'field' | 'resource_type' | 'resource_gid' | 'previous_value'>
): boolean {
  if (row.platform !== 'shopify') return false
  if (row.field !== 'title' && row.field !== 'meta_description') return false
  if (!row.resource_type || !SHOPIFY_ROLLBACK_RESOURCE_TYPES.has(row.resource_type)) return false
  if (!row.resource_gid || typeof row.resource_gid !== 'string') return false
  if (row.previous_value === null) return false
  return true
}

// ---------------------------------------------------------------------------
// Wix (Wix V1 Prompt 2)
// ---------------------------------------------------------------------------

const WIX_ROLLBACK_RESOURCE_TYPES = new Set(['blog_post', 'stores_product'])

/**
 * Shape-only rollback eligibility for Wix rows — the Wix analogue of
 * isShopifyRollbackEligibleByShape above, kept as a genuinely SEPARATE
 * predicate rather than folded into either existing one, exactly per
 * docs/integration-kit.md §9: Wix's resource_type vocabulary
 * (blog_post/stores_product) and identity column (`resource_gid`, a plain
 * Wix item GUID string — not a GID URI the way Shopify's is, but the same
 * underlying `text` column) are structurally different enough from both
 * WordPress's and Shopify's own shapes to warrant their own predicate, and
 * this function's own `row.platform !== 'wix'` check, run FIRST, is what
 * keeps Wix rows from ever being considered by WordPress's or Shopify's
 * eligibility functions (and vice versa) despite all three sharing the
 * same underlying columns.
 *
 * Only 'title' and 'meta_description' are ever eligible — Wix has no
 * direct H1 or Image Alt fix family (see
 * lib/integrations/wix/capabilities.ts's WixFixFamily, which does not
 * even include either).
 */
export function isWixRollbackEligibleByShape(
  row: Pick<FixHistoryRecord, 'platform' | 'field' | 'resource_type' | 'resource_gid' | 'previous_value'>
): boolean {
  if (row.platform !== 'wix') return false
  if (row.field !== 'title' && row.field !== 'meta_description') return false
  if (!row.resource_type || !WIX_ROLLBACK_RESOURCE_TYPES.has(row.resource_type)) return false
  if (!row.resource_gid || typeof row.resource_gid !== 'string') return false
  if (row.previous_value === null) return false
  return true
}
