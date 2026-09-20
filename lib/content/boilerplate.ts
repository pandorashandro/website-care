import type { PageContext } from './context'

/**
 * Phase 29 — cross-page boilerplate detection.
 *
 * Websites naturally repeat header/footer/navigation/CTA text across every
 * page — this must never be classified as "duplicate page content"
 * (lib/content/checks/exact-duplicate.ts already excludes it structurally,
 * since a full-page hash only matches when the ENTIRE substantive text is
 * identical, not just a shared fragment). This module identifies WHICH
 * paragraph-level text blocks are shared template boilerplate, so
 * lib/content/checks/repetitive.ts can measure how much of an INDIVIDUAL
 * page's content is boilerplate versus genuinely its own.
 *
 * DELIBERATELY CONSERVATIVE, NOT A DOM-TEMPLATE ENGINE: a normalized
 * paragraph (trimmed, whitespace-collapsed, case-insensitive) counts as
 * boilerplate only if it appears on at least BOILERPLATE_MIN_FRACTION of
 * ALL eligible analyzed pages, and only once a MINIMUM sample size
 * (BOILERPLATE_MIN_PAGES) exists — mirrors Site Architecture's own
 * MIN_PAGES_FOR_PATTERN precedent for the identical reason: a shared
 * paragraph on a 3-page site proves nothing about site-wide template
 * repetition. No HTML structure (tag names, DOM position, class names) is
 * inspected — only paragraph TEXT — so this works identically regardless
 * of theme/page-builder, without any CMS-specific logic.
 *
 * PERFORMANCE: O(P) where P is the total paragraph count across all
 * eligible pages (each page's content_text is already bounded to 4000
 * characters — see content-extract.ts — so this is bounded well below any
 * O(n²) risk even at a 500-page Bloom Pro crawl).
 */
const BOILERPLATE_MIN_FRACTION = 0.4
const BOILERPLATE_MIN_PAGES = 5

export function normalizeParagraph(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function splitStoredParagraphs(contentText: string | null): string[] {
  if (!contentText) return []
  return contentText
    .split('\n\n')
    .map(normalizeParagraph)
    .filter((text) => text.length > 0)
}

/** The set of normalized paragraph texts classified as cross-page boilerplate, given the current analyzed population. Empty when fewer than BOILERPLATE_MIN_PAGES eligible pages exist. */
export function computeBoilerplateParagraphs(pages: PageContext[]): Set<string> {
  if (pages.length < BOILERPLATE_MIN_PAGES) return new Set()

  const pagesByParagraph = new Map<string, Set<string>>()

  for (const { page } of pages) {
    // A Set here means a paragraph repeated MULTIPLE times on the SAME page
    // only ever counts once toward that paragraph's cross-page page-count —
    // this measures how many DISTINCT PAGES share it, not raw occurrences.
    const paragraphsOnThisPage = new Set(splitStoredParagraphs(page.content_text))

    for (const paragraph of paragraphsOnThisPage) {
      const pageSet = pagesByParagraph.get(paragraph) ?? new Set<string>()
      pageSet.add(page.url)
      pagesByParagraph.set(paragraph, pageSet)
    }
  }

  const minPagesForBoilerplate = pages.length * BOILERPLATE_MIN_FRACTION
  const boilerplate = new Set<string>()

  for (const [paragraph, pageUrls] of pagesByParagraph) {
    if (pageUrls.size >= minPagesForBoilerplate) boilerplate.add(paragraph)
  }

  return boilerplate
}
