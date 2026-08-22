import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import type { WordPressEditableContentResult } from '@/lib/integrations/wordpress/editable-content'

export type CurrentValueResult =
  | { available: true; label: string; value: string }
  | { available: false; reason: string }

/** References the scanner's own fixed title strings rather than re-hardcoding them, so this stays in sync with issue-definitions.ts automatically. */
const TITLE_ISSUE_TITLES = new Set<string>([
  ISSUE_DEFINITIONS.missing_title.title,
  ISSUE_DEFINITIONS.title_too_short.title,
  ISSUE_DEFINITIONS.title_too_long.title,
])

const META_DESCRIPTION_ISSUE_TITLES = new Set<string>([
  ISSUE_DEFINITIONS.missing_meta_description.title,
  ISSUE_DEFINITIONS.meta_description_too_short.title,
  ISSUE_DEFINITIONS.meta_description_too_long.title,
])

/**
 * Extracts the current WordPress value relevant to a given issue, from an
 * already-loaded editable content result. Deterministic and title-keyed —
 * mirrors the same title-based issue identity approach used in
 * lib/fixes/fixability.ts, for the same reason (the issues table has no
 * more stable identifier available yet).
 *
 * Deliberately narrow for this phase:
 * - Title issues resolve to content.title (title.raw from WordPress).
 * - Meta description issues explicitly report "not yet available" — core
 *   WordPress REST content has no universal SEO-metadata field; that's
 *   owned by whichever SEO plugin (if any) is installed, which this phase
 *   does not detect or assume. This is a documented limitation, not a bug.
 * - Missing H1 and missing image alt are not given a current value here:
 *   an H1 isn't cleanly extractable from raw HTML content without risking
 *   an incorrect edit target, and image alt requires media mapping this
 *   phase doesn't attempt. Both fall through to the default "not yet known".
 */
export function extractCurrentValueForIssue(
  issueTitle: string,
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>
): CurrentValueResult {
  if (TITLE_ISSUE_TITLES.has(issueTitle)) {
    return content.title !== null
      ? { available: true, label: 'Current title', value: content.title }
      : { available: false, reason: 'The current title could not be read from WordPress.' }
  }

  if (META_DESCRIPTION_ISSUE_TITLES.has(issueTitle)) {
    return {
      available: false,
      reason:
        'This WordPress page was identified, but the plugin that manages its meta description is not yet determined.',
    }
  }

  return {
    available: false,
    reason: 'Website Care does not yet know which WordPress field this issue applies to.',
  }
}
