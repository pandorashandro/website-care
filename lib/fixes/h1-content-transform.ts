/**
 * Pure H1-insertion transformation. No fetch, no Supabase, no credentials,
 * no React — safe to unit test directly and to reuse identically for both
 * building the write payload (Apply) and reconstructing the exact expected
 * snippet to search for (Rollback).
 *
 * Insertion strategy: prepend at the absolute start of content.raw. This is
 * the only boundary that is always identifiable with zero ambiguity — it
 * never requires parsing or understanding what follows, so everything else
 * in content.raw is guaranteed to be preserved byte-for-byte (pure string
 * concatenation, nothing reformatted/reordered/reparsed).
 */

export type H1ContentSourceKind = 'gutenberg' | 'classic_html'

export type H1ContentTransformResult =
  | { status: 'ready'; updatedContent: string; insertedSnippet: string }
  | { status: 'unsafe'; reason: string }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Builds the exact bytes that would be inserted for a given source format
 * and approved H1 text — deterministic (same inputs always produce the same
 * output), which is what makes rollback's exact-substring reconstruction
 * possible without storing the original content anywhere. Returns null only
 * if the text is empty after trimming (defensive — callers already run
 * validateAiH1 first).
 */
export function buildH1InsertionSnippet(params: { source: H1ContentSourceKind; proposedH1: string }): string | null {
  const trimmed = params.proposedH1.trim()
  if (!trimmed) return null

  const escaped = escapeHtml(trimmed)

  if (params.source === 'gutenberg') {
    return `<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">${escaped}</h1>\n<!-- /wp:heading -->\n\n`
  }

  return `<h1>${escaped}</h1>\n\n`
}

/**
 * Prepends the insertion snippet to rawContent. Guarantees: exactly one H1
 * is added, the approved text is HTML-escaped, no existing content is
 * modified, reordered, or reformatted — rawContent appears unchanged after
 * the inserted snippet, in full.
 */
export function buildContentWithInsertedH1(params: {
  source: H1ContentSourceKind
  rawContent: string
  proposedH1: string
}): H1ContentTransformResult {
  const snippet = buildH1InsertionSnippet({ source: params.source, proposedH1: params.proposedH1 })

  if (!snippet) {
    return { status: 'unsafe', reason: 'No safe heading text was available to insert.' }
  }

  return { status: 'ready', updatedContent: snippet + params.rawContent, insertedSnippet: snippet }
}
