import 'server-only'
import { fetchPage, getH1Texts } from '@/lib/scanner/checks'
import type { WordPressEditableContentResult } from '@/lib/integrations/wordpress/editable-content'

export type H1ContentSource = 'gutenberg' | 'classic_html' | 'builder_or_custom' | 'unknown'

export type H1SourceDetectionResult =
  | {
      status: 'supported'
      source: 'gutenberg' | 'classic_html'
      issueKind: 'missing_h1' | 'multiple_h1'
      publicH1s: string[]
      editableH1s: string[]
      futureWritePossible: true
      reason: string
    }
  | {
      status: 'unsupported'
      source: 'builder_or_custom' | 'unknown'
      futureWritePossible: false
      reason: string
    }
  | {
      status: 'ambiguous'
      source: H1ContentSource
      futureWritePossible: false
      reason: string
    }
  | {
      status: 'connection_error'
      reason: string
    }

const GUTENBERG_BLOCK_COMMENT = /<!--\s*\/?wp:[\s\S]*?-->/i

/**
 * Deliberately a short, highly-specific list rather than an attempt to
 * fingerprint every page builder — each pattern here is a marker that is
 * essentially never present by coincidence in ordinary WordPress content,
 * so its presence is trusted as strong evidence the H1 is NOT plain
 * editable content, without needing to understand the builder itself.
 */
const BUILDER_MARKER_PATTERNS: RegExp[] = [
  /elementor/i,
  /\bet_pb_/i, // Divi
  /\[vc_row\b/i, // WPBakery
  /\bfl-builder\b/i, // Beaver Builder
  /\bfusion-builder\b/i, // Avada / Fusion Builder
]

/** Exported for reuse by H1 rollback (see wordpress-h1-rollback-actions.ts), which needs the same conservative classification without duplicating it. */
export function classifyH1ContentSource(rawContent: string | null): H1ContentSource {
  if (!rawContent || rawContent.trim().length === 0) return 'unknown'

  if (BUILDER_MARKER_PATTERNS.some((pattern) => pattern.test(rawContent))) {
    return 'builder_or_custom'
  }

  if (GUTENBERG_BLOCK_COMMENT.test(rawContent)) {
    return 'gutenberg'
  }

  return 'classic_html'
}

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

const UNSUPPORTED_BUILDER_REASON =
  'This heading appears to be controlled by a page builder, theme, or another content layer. Website Care will not modify it automatically.'

const UNSUPPORTED_UNKNOWN_REASON =
  "Website Care could not confirm where this page's content comes from, so it will not modify this heading automatically."

const AMBIGUOUS_REASON =
  'Website Care found conflicting H1 information between WordPress content and the public page, so automatic editing is disabled.'

const SUPPORTED_REASON = "Website Care identified this H1 issue inside the page's editable WordPress content."

/**
 * Determines whether a public H1 issue (missing or multiple H1s) can be
 * confidently traced to the exact mapped WordPress resource's own editable
 * content — never to a page builder, theme template, or other content
 * layer outside content.raw. READ-ONLY: fetches the PUBLIC page once (no
 * credentials attached) and reuses the already-loaded editable resource;
 * issues no WordPress REST request of its own.
 *
 * Safety over coverage: returns 'supported' only when the public and
 * editable H1 state are logically consistent with each other AND the
 * content format is confidently Gutenberg or Classic HTML. Any
 * contradiction, count mismatch, or unfamiliar content shape resolves to
 * 'ambiguous' or 'unsupported' rather than a best guess.
 */
export async function detectH1Source(input: {
  pageUrl: string
  issueKind: 'missing_h1' | 'multiple_h1'
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>
}): Promise<H1SourceDetectionResult> {
  const { pageUrl, issueKind, content } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'connection_error', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'connection_error', reason: 'The public page did not return a normal response when checked.' }
  }

  const publicH1s = getH1Texts(fetched.html)
  const source = classifyH1ContentSource(content.content)

  if (source === 'builder_or_custom' || source === 'unknown') {
    return {
      status: 'unsupported',
      source,
      futureWritePossible: false,
      reason: source === 'builder_or_custom' ? UNSUPPORTED_BUILDER_REASON : UNSUPPORTED_UNKNOWN_REASON,
    }
  }

  // source is 'gutenberg' or 'classic_html' — content.content is
  // guaranteed non-null/non-empty here (classifyH1ContentSource only
  // returns 'unknown' otherwise).
  const editableH1s = getH1Texts(content.content as string)

  if (issueKind === 'missing_h1') {
    // Re-confirm fresh public state rather than trusting the original
    // scan's snapshot — the page may have changed since.
    if (publicH1s.length !== 0 || editableH1s.length !== 0) {
      return { status: 'ambiguous', source, futureWritePossible: false, reason: AMBIGUOUS_REASON }
    }

    return {
      status: 'supported',
      source,
      issueKind: 'missing_h1',
      publicH1s,
      editableH1s,
      futureWritePossible: true,
      reason: SUPPORTED_REASON,
    }
  }

  // multiple_h1
  if (publicH1s.length <= 1) {
    return { status: 'ambiguous', source, futureWritePossible: false, reason: AMBIGUOUS_REASON }
  }

  const sameCount = editableH1s.length === publicH1s.length
  const sameTextsInOrder =
    sameCount && editableH1s.every((text, i) => normalizeForComparison(text) === normalizeForComparison(publicH1s[i]))

  if (!sameCount || !sameTextsInOrder) {
    return { status: 'ambiguous', source, futureWritePossible: false, reason: AMBIGUOUS_REASON }
  }

  return {
    status: 'supported',
    source,
    issueKind: 'multiple_h1',
    publicH1s,
    editableH1s,
    futureWritePossible: true,
    reason: SUPPORTED_REASON,
  }
}
