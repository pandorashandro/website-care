import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'
import { computeBoilerplateParagraphs, splitStoredParagraphs } from '../boilerplate'

/**
 * Phase 29 — highly repetitive (boilerplate-dominated) pages.
 *
 * DIFFERENT from exact_duplicate_content: that check finds pages whose
 * ENTIRE substantive content matches one other specific page. This check
 * instead finds pages where MOST of the page's own paragraphs are shared
 * template boilerplate (see lib/content/boilerplate.ts) — regardless of
 * whether any other single page happens to match it exactly. A page could
 * have a healthy total word count yet still be "highly repetitive" if the
 * vast majority of that text is the same header/footer/CTA block repeated
 * everywhere, leaving very little that is actually this page's own content.
 *
 * Requires at least MIN_PARAGRAPHS_FOR_PATTERN (3) total paragraphs before
 * evaluating a ratio at all — a 1-paragraph page being "100% boilerplate"
 * is really just a thin-content signal (already substantively_thin_page's
 * job), not a meaningful repetition pattern.
 *
 * Confidence is 'medium', not 'high' — boilerplate classification itself is
 * a frequency-based heuristic (a paragraph appearing on enough OTHER pages
 * to look templated), not a certainty.
 *
 * NOT suppressed on a partial crawl: boilerplate detection can only
 * UNDER-classify on a partial crawl (fewer pages seen means a genuinely
 * repeated paragraph might not yet cross the frequency threshold) — the
 * safe direction, never a false positive from incomplete evidence.
 *
 * PROMPT 3 REAL-WORLD FALSE-POSITIVE PROTECTION: when EVERY flagged page
 * also carries lib/category-engine/eligibility.ts's generic
 * hasLikelyAuxiliaryUrlSignal (link-discovered + query string — see that
 * function's own doc comment), confidence is pulled down one further notch
 * (medium -> low) rather than suppressing the finding — auxiliary/template
 * variant pages are more likely to share boilerplate by construction, so a
 * flagged set made up ENTIRELY of them is a weaker signal of a real
 * page-content problem than an ordinary mix of pages would be.
 */
const REPETITIVE_RATIO_THRESHOLD = 0.7
const MIN_PARAGRAPHS_FOR_PATTERN = 3

export function analyzeHighlyRepetitivePages(context: AnalyzerContext): RawFinding[] {
  const boilerplateParagraphs = computeBoilerplateParagraphs(context.eligiblePages)
  if (boilerplateParagraphs.size === 0) return []

  const instances: RawFindingPageEvidence[] = []
  let allFlaggedAreLikelyAuxiliary = true

  for (const { page, hasAuxiliaryUrlSignal } of context.eligiblePages) {
    const paragraphs = splitStoredParagraphs(page.content_text)
    if (paragraphs.length < MIN_PARAGRAPHS_FOR_PATTERN) continue

    const boilerplateCount = paragraphs.filter((paragraph) => boilerplateParagraphs.has(paragraph)).length
    const ratio = boilerplateCount / paragraphs.length
    if (ratio < REPETITIVE_RATIO_THRESHOLD) continue

    if (!hasAuxiliaryUrlSignal) allFlaggedAreLikelyAuxiliary = false

    instances.push({
      url: page.url,
      currentState: { label: 'Share of this page\'s paragraphs that are shared template text', value: `${Math.round(ratio * 100)}%` },
      detail: { boilerplateParagraphCount: boilerplateCount, totalParagraphCount: paragraphs.length },
    })
  }

  if (instances.length === 0) return []

  const confidence = allFlaggedAreLikelyAuxiliary ? 'low' : 'medium'

  return [
    {
      checkKey: 'highly_repetitive_page',
      category: 'duplication',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence,
      title: 'Pages consist mostly of repeated template content',
      explanation: `${instances.length} page${instances.length === 1 ? '' : 's'} webioom analyzed ${instances.length === 1 ? 'is' : 'are'} made up mostly of text that repeats across many other pages, leaving little content specific to ${instances.length === 1 ? 'this page' : 'these pages'}.${allFlaggedAreLikelyAuxiliary ? ' These pages are only reachable through internal links and carry extra URL parameters, which are more often auto-generated variants than pages meant to stand on their own — webioom is less certain this reflects a real content problem.' : ''}`,
      whyItMatters: 'When a page is almost entirely shared template text, it offers little unique value of its own to visitors or search engines beyond the pages it repeats.',
      recommendation: 'Add page-specific content so this page stands on its own rather than relying mostly on shared navigation, headers, or boilerplate text.',
      evidence: { includesOnlyLikelyAuxiliaryPages: allFlaggedAreLikelyAuxiliary },
      affectedPages: instances,
    },
  ]
}
