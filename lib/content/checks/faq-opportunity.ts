import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 29 — FAQ opportunity. The canonical example of an OPPORTUNITY
 * rather than a PROBLEM (see lib/content/health.ts): "could add an FAQ
 * section" is a suggestion for already-adequate content, never a health
 * deduction — this check's `kind` is 'opportunity', so it NEVER enters the
 * score's deduction formula regardless of its severity/confidence fields.
 *
 * Deliberately conservative: only considered for pages that are already
 * substantive (>= 150 words — a thin page has more basic problems than
 * missing an FAQ, already covered by substantively_thin_page).
 *
 * REAL-WORLD EVIDENCE-QUALITY PASS — the original rule treated ANY heading
 * containing a bare "?" as proof of question/FAQ coverage. This produced a
 * demonstrated false negative: a marketing CTA phrased as a question
 * ("Ready to Grow Your Business?") would silently suppress the opportunity
 * even though it has nothing to do with answering visitor questions. Fixed
 * with STRONGER, still-generic deterministic evidence, using two distinct
 * signals rather than one:
 *
 * 1. FAQ_LABEL_SIGNAL: an explicit FAQ-family term (faq, "frequently
 *    asked", "common questions", "q&a") anywhere in the heading — the
 *    clearest possible label a page could use.
 * 2. GENUINE_QUESTION_SIGNAL: a heading that is GRAMMATICALLY an
 *    interrogative question — starts with a WH-word (what/how/why/etc.) or
 *    a genuine question auxiliary (do/does/is/are/can/will/...) AND ends
 *    with "?". This is a general English-grammar distinction, not a
 *    business- or CMS-specific rule: real questions ("How much does this
 *    cost?") open this way; marketing CTAs phrased as rhetorical questions
 *    ("Ready to...", "Want to...", "Looking for...") open with an
 *    imperative/adjective/gerund instead and are correctly NOT matched.
 *
 * PAGE PURPOSE now influences relevance: a 'contact' page's entire purpose
 * is already to be simple and direct — suggesting it also grow an FAQ
 * section is a lower-value, often-irrelevant suggestion, so contact pages
 * are excluded from consideration entirely (an intentional narrowing of
 * WHEN this opportunity is even relevant, not a detection change).
 *
 * Confidence is 'low' throughout: this is a suggestion, not a diagnosis —
 * never claims a specific missing topic, and never treats the absence of a
 * heading literally named "FAQ" as high-confidence proof nothing answers
 * common questions.
 *
 * PAGE-LOCAL: not suppressed on a partial crawl.
 */
const MIN_WORDS_TO_CONSIDER = 150
const FAQ_LABEL_SIGNAL = /faq|frequently asked|common questions|q\s*&\s*a/i
const GENUINE_QUESTION_SIGNAL = /^\s*(what|how|why|when|where|who|which|can|do|does|is|are|will|should|would|could)\b[\s\S]*\?\s*$/i

function hasQuestionCoverageSignal(text: string): boolean {
  return FAQ_LABEL_SIGNAL.test(text) || GENUINE_QUESTION_SIGNAL.test(text)
}

export function analyzeFaqOpportunity(context: AnalyzerContext): RawFinding[] {
  const candidates = context.eligiblePages.filter(({ page, pageType }) => {
    if (pageType.type === 'contact') return false
    if (page.content_word_count < MIN_WORDS_TO_CONSIDER) return false

    const h1HasSignal = !!page.h1_text && hasQuestionCoverageSignal(page.h1_text)
    const headingsHaveSignal = page.content_heading_texts.some((heading) => hasQuestionCoverageSignal(heading))

    return !h1HasSignal && !headingsHaveSignal
  })

  if (candidates.length === 0) return []

  return [
    {
      checkKey: 'faq_opportunity',
      category: 'faq',
      scope: 'page',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'low',
      title: 'Pages could add a questions/FAQ section',
      explanation: `${candidates.length} substantive page${candidates.length === 1 ? '' : 's'} webioom analyzed ${candidates.length === 1 ? 'has' : 'have'} no heading suggesting a questions/FAQ section.`,
      whyItMatters: 'A short FAQ section can pre-emptively answer common visitor questions and sometimes surface in search results as an additional entry point to the page — this is a suggestion for already-adequate content, not a sign anything is wrong.',
      recommendation: 'Consider adding a brief FAQ or "Common questions" section covering what visitors most often ask about this topic.',
      evidence: {},
      affectedPages: candidates.map(({ page }) => ({
        url: page.url,
        currentState: { label: 'Question/FAQ-style heading found', value: 'None' },
        detail: { wordCount: page.content_word_count },
      })),
    },
  ]
}
