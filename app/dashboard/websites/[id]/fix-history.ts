import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type FixHistoryInsertInput = {
  websiteId: string
  issueTitle: string
  pageUrl: string
  /** Only ever populated for field: 'image_alt' — the trusted, server-derived image URL this row's write/rollback targeted. Null for every other field. */
  imageUrl?: string | null
  /** Only ever populated for field: 'image_alt' — the exact strategy actually used for this row's write, taken from the freshly revalidated detectImageAltSource result, never from browser input. Null for every other field. */
  writeStrategy?: 'media_alt_text' | 'gutenberg_content_alt' | 'classic_html_alt' | null
  resourceType: 'page' | 'post'
  resourceId: number
  field: 'title' | 'meta_description' | 'h1' | 'image_alt'
  previousValue: string | null
  appliedValue: string
  verificationStatus: string
}

export type FixHistoryInsertResult = 'saved' | 'failed'

/**
 * Records a durable audit row for one already-completed, already-confirmed
 * WordPress title write. This is an internal helper, not a Server Action —
 * it is reachable only from inside applyFix, after ownership, capability,
 * and WordPress response validation have all already passed, so every value
 * here is server-derived rather than accepted fresh from the browser. A
 * failure here never implies (and must never be reported as) the WordPress
 * write having failed — the external change already happened regardless.
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
      platform: 'wordpress',
      resource_type: input.resourceType,
      resource_id: input.resourceId,
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
  /** Only ever non-null for field='image_alt' rows — one of 'media_alt_text' | 'gutenberg_content_alt' | 'classic_html_alt'. */
  write_strategy: string | null
  platform: string
  resource_type: string | null
  resource_id: number | null
  field: string
  previous_value: string | null
  applied_value: string
  verification_status: string
  created_at: string
}

const RECENT_FIXES_LIMIT = 10

const FIX_HISTORY_COLUMNS =
  'id, issue_title, page_url, image_url, write_strategy, platform, resource_type, resource_id, field, previous_value, applied_value, verification_status, created_at'

/**
 * Read-only, for display in the report's "Recent Fixes" section. Selects an
 * explicit column list (never `select('*')`) and relies on the same
 * ownership check the report page itself already performed on `websiteId`
 * before rendering, with RLS as the enforced second layer underneath.
 */
export async function getRecentFixHistory(websiteId: string): Promise<FixHistoryRecord[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fix_history')
    .select(FIX_HISTORY_COLUMNS)
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(RECENT_FIXES_LIMIT)
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
 * meta_description rollback additionally re-detects its provider fresh at
 * rollback time (see wordpress-meta-rollback-actions.ts) rather than
 * needing it stored here — fix_history has no provider column. Likewise,
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
 */
const IMAGE_ALT_WRITE_STRATEGIES = new Set(['media_alt_text', 'gutenberg_content_alt', 'classic_html_alt'])

export function isRollbackEligibleByShape(
  row: Pick<
    FixHistoryRecord,
    'platform' | 'field' | 'resource_type' | 'resource_id' | 'previous_value' | 'image_url' | 'write_strategy'
  >
): boolean {
  if (row.platform !== 'wordpress') return false
  if (row.field !== 'title' && row.field !== 'meta_description' && row.field !== 'h1' && row.field !== 'image_alt') {
    return false
  }
  if (row.resource_type !== 'page' && row.resource_type !== 'post') return false
  if (typeof row.resource_id !== 'number') return false
  if (row.previous_value === null) return false
  if (row.field === 'image_alt') {
    if (!row.image_url || typeof row.image_url !== 'string') return false
    if (!row.write_strategy || !IMAGE_ALT_WRITE_STRATEGIES.has(row.write_strategy)) return false
  }
  return true
}
