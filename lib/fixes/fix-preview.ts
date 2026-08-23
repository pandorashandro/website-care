import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import type { WordPressEditableContentResult } from '@/lib/integrations/wordpress/editable-content'
import { generateTitleProposal, type TitleIssueKind } from './title-preview'

export type FixPreview =
  | {
      status: 'ready'
      issueTitle: string
      resourceType: 'page' | 'post'
      resourceId: number
      permalink: string
      field: 'title'
      currentValue: string | null
      proposedValue: string
      explanation: string
    }
  | { status: 'unsupported'; reason: string }
  | { status: 'unavailable'; reason: string }

export type FixSupport = 'title' | 'meta_description' | 'unsupported'

/** References the scanner's own fixed title strings rather than re-hardcoding them. */
const TITLE_ISSUE_KIND: Record<string, TitleIssueKind> = {
  [ISSUE_DEFINITIONS.missing_title.title]: 'missing',
  [ISSUE_DEFINITIONS.title_too_short.title]: 'too_short',
  [ISSUE_DEFINITIONS.title_too_long.title]: 'too_long',
}

const META_DESCRIPTION_ISSUE_TITLES = new Set<string>([
  ISSUE_DEFINITIONS.missing_meta_description.title,
  ISSUE_DEFINITIONS.meta_description_too_short.title,
  ISSUE_DEFINITIONS.meta_description_too_long.title,
])

const GENERIC_UNSUPPORTED_REASON = 'Preview not available yet for this fix type.'

const META_DESCRIPTION_REASON =
  'WordPress page identified, but Website Care does not yet know which SEO metadata provider controls this field.'

const TITLE_EXPLANATION = 'Website Care proposes a clearer title that stays within a recommended length.'

/**
 * Static classification — does not require loading any WordPress content,
 * so callers can skip the WordPress round-trip entirely for issue types
 * outside the supported fix family (missing H1, missing image alt, and
 * everything else) rather than fetching data only to discard it.
 */
export function classifyIssueForFixPreview(issueTitle: string): FixSupport {
  if (issueTitle in TITLE_ISSUE_KIND) return 'title'
  if (META_DESCRIPTION_ISSUE_TITLES.has(issueTitle)) return 'meta_description'
  return 'unsupported'
}

/**
 * Resolves an issue title to its specific title-fix kind for the write
 * path (applyFix), so the apply action never has to re-derive or duplicate
 * this mapping itself. Returns null for anything outside the three
 * supported title issues — the only fixes this application is ever allowed
 * to write to WordPress.
 */
export function getTitleIssueKind(issueTitle: string): TitleIssueKind | null {
  return TITLE_ISSUE_KIND[issueTitle] ?? null
}

function buildTitleFixPreview(
  issueTitle: string,
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>,
  websiteName: string | null
): FixPreview {
  const issueKind = TITLE_ISSUE_KIND[issueTitle]

  const proposal = generateTitleProposal(issueKind, {
    currentTitle: content.title,
    slug: content.slug,
    websiteName,
  })

  if (!proposal.ok) {
    return { status: 'unavailable', reason: proposal.reason }
  }

  return {
    status: 'ready',
    issueTitle,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    permalink: content.permalink,
    field: 'title',
    currentValue: content.title,
    proposedValue: proposal.proposedValue,
    explanation: TITLE_EXPLANATION,
  }
}

/**
 * Composes the final Current -> Proposed preview (or a safe unsupported /
 * unavailable explanation) from already-loaded editable WordPress content.
 * Pure and network-free itself — all WordPress I/O happens before this is
 * called, via the existing (unmodified) mapping/content-loading flow.
 */
export function buildFixPreview(
  issueTitle: string,
  content: WordPressEditableContentResult,
  websiteName: string | null
): FixPreview {
  if (content.status !== 'loaded') {
    return { status: 'unavailable', reason: content.reason }
  }

  const support = classifyIssueForFixPreview(issueTitle)

  if (support === 'meta_description') {
    return { status: 'unsupported', reason: META_DESCRIPTION_REASON }
  }

  if (support === 'unsupported') {
    return { status: 'unsupported', reason: GENERIC_UNSUPPORTED_REASON }
  }

  return buildTitleFixPreview(issueTitle, content, websiteName)
}
