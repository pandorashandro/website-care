import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 29 — weak content structure.
 *
 * IMPORTANT SCOPE, stated honestly rather than implied: this check only
 * evaluates the relationship between content LENGTH and its PARAGRAPH/
 * HEADING BREAKDOWN — it does NOT evaluate writing quality, heading
 * HIERARCHY (only H2-level headings are persisted at all — see
 * lib/crawler/content-extract.ts — so an H1->H3 level-skip cannot be
 * detected from current evidence), or whether headings are descriptive. A
 * page passing both conditions below has "some structural breakdown
 * relative to its length," never "generally good structure" — see
 * lib/content/dimensions.ts's own minimum-evidence handling for how this
 * scope limitation is surfaced honestly at the dimension level.
 *
 * TWO DISTINCT, DELIBERATELY NARROW conditions, both deterministic and
 * directly observed (content_paragraph_count/content_heading_texts are
 * literal counts, not inferred):
 *
 * 1. EXTREME_UNBROKEN_TEXT: >= 150 words (the same general threshold
 *    substantively_thin_page uses for unclassified pages) crammed into at
 *    most one paragraph AND zero H2 headings — the original "wall of text"
 *    case.
 * 2. LONG_CONTENT_ZERO_HEADINGS: a page substantially LONGER than that
 *    (>= 400 words) with zero H2 headings AT ALL, regardless of paragraph
 *    count. A long page broken into several paragraphs is more readable
 *    than an unbroken block, but a genuinely long page with not even one
 *    section heading is still a defensible, generic structure concern most
 *    editors would flag — this catches the case condition 1 alone misses
 *    (many short paragraphs, but no sections, on a long page).
 *
 * PAGE-LOCAL: not suppressed on a partial crawl. Confidence is 'high' for
 * both conditions (directly observed counts).
 */
const MIN_WORDS_TO_EXPECT_STRUCTURE = 150
const MAX_PARAGRAPHS_FOR_UNSTRUCTURED = 1
const LONG_CONTENT_WORD_THRESHOLD = 400

type WeakStructureReason = 'extreme_unbroken_text' | 'long_content_zero_headings'

function weakStructureReason(page: { content_word_count: number; content_paragraph_count: number; content_heading_texts: string[] }): WeakStructureReason | null {
  if (page.content_word_count >= MIN_WORDS_TO_EXPECT_STRUCTURE && page.content_paragraph_count <= MAX_PARAGRAPHS_FOR_UNSTRUCTURED && page.content_heading_texts.length === 0) {
    return 'extreme_unbroken_text'
  }
  if (page.content_word_count >= LONG_CONTENT_WORD_THRESHOLD && page.content_heading_texts.length === 0) {
    return 'long_content_zero_headings'
  }
  return null
}

export function analyzeWeakContentStructure(context: AnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((pageContext) => ({ ...pageContext, reason: weakStructureReason(pageContext.page) }))
    .filter((pageContext): pageContext is typeof pageContext & { reason: WeakStructureReason } => pageContext.reason !== null)

  if (affected.length === 0) return []

  const instances: RawFindingPageEvidence[] = affected.map(({ page, reason }) => ({
    url: page.url,
    currentState: { label: 'Paragraphs / section headings', value: `${page.content_paragraph_count} / ${page.content_heading_texts.length}` },
    detail: { wordCount: page.content_word_count, paragraphCount: page.content_paragraph_count, headingCount: page.content_heading_texts.length, reason },
  }))

  return [
    {
      checkKey: 'weak_content_structure',
      category: 'structure',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Pages present content with little structural organization',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed ${affected.length === 1 ? 'has' : 'have'} a meaningful amount of text with little or no paragraph/section breakdown for its length. This checks paragraph and heading counts relative to content length only — not writing quality or heading hierarchy.`,
      whyItMatters: 'Content presented with little structural breakdown is harder for visitors to scan and understand, even when the underlying information is substantial.',
      recommendation: 'Break this content into shorter paragraphs and add section headings to organize it.',
      evidence: {},
      affectedPages: instances,
    },
  ]
}
