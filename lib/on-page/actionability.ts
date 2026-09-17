import type { CheckKey, Actionability } from './types'

/**
 * Phase 28 — static, per-check actionability classification for On-Page
 * SEO. Mirrors lib/architecture/actionability.ts's own reasoning: every
 * classification here reflects ACTUAL, currently-wired backend capability
 * (see lib/fixes/fix-preview.ts and the per-platform
 * app/dashboard/websites/[id]/wordpress-*-fix-actions.ts server actions —
 * the source of truth this file was checked against), never what would be
 * nice to automate later.
 *
 * Verified backend capability, per check (traced through
 * lib/fixes/fix-preview.ts and lib/fixes/title-preview.ts specifically):
 *
 * - TITLE: `TitleIssueKind = 'missing' | 'too_short' | 'too_long'`
 *   (lib/fixes/title-preview.ts) is a CLOSED union with a real, wired
 *   Preview -> Apply -> Verify -> Rollback path
 *   (app/dashboard/websites/[id]/wordpress-fix-actions.ts/
 *   wordpress-rollback-actions.ts). missing_title/title_too_short/
 *   title_too_long map exactly onto it -> 'prepared_fix'. `duplicate_title`
 *   and `weak_title` are NOT members of that closed union — invoking the
 *   existing Apply path for them would require extending
 *   lib/fixes/title-preview.ts's own type, which is exactly the "redesign
 *   the execution engine" this phase must not do -> 'guided_fix'.
 * - META DESCRIPTION: `MetaDescriptionIssueKind` (lib/ai/
 *   meta-description-recommendation.ts) is the same closed
 *   missing/too_short/too_long shape, with a real wired Apply/Rollback path
 *   (wordpress-meta-fix-actions.ts/wordpress-meta-rollback-actions.ts) ->
 *   'prepared_fix' for the three length-based checks. `duplicate_meta_description`
 *   is outside that union for the same reason as duplicate_title ->
 *   'guided_fix'.
 * - HEADINGS: `H1IssueKind = 'missing_h1' | 'multiple_h1'`
 *   (lib/fixes/fix-preview.ts) both exist as a type, but only missing_h1 has
 *   a genuine WRITE path (wordpress-h1-fix-actions.ts/
 *   wordpress-h1-rollback-actions.ts, via lib/fixes/h1-content-transform.ts's
 *   unambiguous prepend-at-start insertion) -> 'prepared_fix'. multiple_h1
 *   is confirmed diagnostic-only — deciding WHICH of several existing H1s to
 *   demote/remove is an editorial decision with no safe automatic answer
 *   (lib/fixes/fix-preview.ts's own doc comment: "no destructive fix is
 *   decided automatically") -> 'guided_fix'.
 *
 * `as const satisfies Record<CheckKey, Actionability>` makes it a compile
 * error to add a new CheckKey without also classifying it here.
 */
export const CHECK_ACTIONABILITY = {
  missing_title: 'prepared_fix',
  title_too_short: 'prepared_fix',
  title_too_long: 'prepared_fix',
  weak_title: 'guided_fix',
  duplicate_title: 'guided_fix',
  missing_meta_description: 'prepared_fix',
  meta_description_too_short: 'prepared_fix',
  meta_description_too_long: 'prepared_fix',
  duplicate_meta_description: 'guided_fix',
  missing_h1: 'prepared_fix',
  multiple_h1: 'guided_fix',
} as const satisfies Record<CheckKey, Actionability>

export function getActionability(checkKey: CheckKey): Actionability {
  return CHECK_ACTIONABILITY[checkKey]
}
