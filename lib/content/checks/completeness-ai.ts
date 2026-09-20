import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'
import type { CompletenessInterpretationInput, CompletenessInterpretationResult, CompletenessDimension } from '../ai/completeness-interpretation'

/**
 * Phase 29 — Content Completeness, AI-assisted. NOT part of the default
 * `ANALYZERS` list in lib/content/run-analysis.ts (a deterministic-only
 * list) — invoked separately, only when a `completenessAiHook` is passed to
 * `analyzeContent`. As of the Phase 29 targeted completion pass, the real
 * production caller (app/dashboard/websites/[id]/content-actions.ts) DOES
 * pass one (`interpretContentCompleteness`), so this module runs on every
 * real Content analysis — but the injection seam itself is preserved
 * (tests still pass fakes/throwing hooks) so this stays fully testable
 * without a live Anthropic call. This module implements the FULL
 * responsible-AI architecture this phase requires:
 *
 * - COST CONTROL: evaluates only a BOUNDED subset of eligible pages
 *   (`AI_MAX_PAGES_PER_ANALYSIS`), never every page on a 500-page crawl.
 *   Pages are prioritized by substantive word count (richer pages are more
 *   informative to interpret, and pages already flagged
 *   substantively_thin_page have a more basic, already-covered problem).
 *   Pages with 'low' extraction confidence are skipped entirely — the same
 *   honesty rule lib/content/checks/thin-content.ts applies: unreliable
 *   extraction evidence must not feed a semantic conclusion either.
 * - ISOLATION: one page's AI call failing/throwing never blocks the
 *   others — each call is individually try/caught.
 * - HONEST COVERAGE: the finding's own evidence records exactly how many
 *   eligible pages were reviewed versus how many existed, so a customer
 *   never mistakes "we checked the 10 richest pages" for "we checked
 *   everything."
 * - BOUNDED SCORE IMPACT (Phase 29 targeted completion pass — INITIAL
 *   PRODUCTION RELEASE POLICY): every AI interpretation, REGARDLESS of the
 *   AI's own self-reported confidence (including 'high'), becomes a
 *   `kind: 'opportunity'` finding — ZERO Content Health impact. This is a
 *   deliberate, explicit trust boundary: there is no empirical track record
 *   yet of this specific prompt's real-world accuracy against genuine SEO
 *   audit judgments, so no AI-derived conclusion is allowed to cost a
 *   customer Content Health points in this release, no matter how
 *   confident the model claims to be. `content_completeness_gap` (the
 *   `kind: 'problem'` check key) remains defined in the schema for a
 *   FUTURE release once that track record exists, but no code path here
 *   produces one today.
 */
export type CompletenessAiHook = (input: CompletenessInterpretationInput) => Promise<CompletenessInterpretationResult>

export const AI_MAX_PAGES_PER_ANALYSIS = 10
const MIN_WORDS_TO_CONSIDER_FOR_AI = 50

/**
 * Unified webioom engine, Prompt 2 — an overall WALL-CLOCK budget for this
 * whole check, not just a per-call timeout. `generateAiCompletion` already
 * times out ONE call after 10s (lib/ai/client.ts), but this loop calls it
 * up to AI_MAX_PAGES_PER_ANALYSIS times SEQUENTIALLY — 10 calls at ~10s
 * worst case each is up to 100s, a real risk of exceeding a serverless
 * function's own request timeout when this now runs as one of seven
 * analyzers inside the unified Scan Website pipeline (see
 * app/dashboard/websites/[id]/scan-actions.ts's runCategoryAnalyses). This
 * is a bounded, fail-soft guard, NOT an AI-system redesign: once the budget
 * is exceeded, remaining candidate pages are simply not reviewed this
 * pass — already-collected results are still used, and the finding's own
 * evidence (`pagesReviewed`) honestly reflects how many pages were actually
 * covered, exactly like the existing AI_MAX_PAGES_PER_ANALYSIS bound
 * already does for page COUNT. Deterministic Content findings are entirely
 * unaffected either way (this check runs after them and is independently
 * try/caught in run-analysis.ts).
 */
export const AI_WALL_CLOCK_BUDGET_MS = 25_000

const DIMENSION_LABELS: Record<CompletenessDimension, string> = {
  what_it_is: 'what this is',
  who_its_for: 'who it is for',
  benefits_outcomes: 'benefits or outcomes',
  process_how_it_works: 'the process or how it works',
  proof_examples: 'proof or examples',
  common_questions: 'common visitor questions',
  next_step: 'a clear next step',
}

function describeMissingDimensions(dimensions: CompletenessDimension[]): string {
  return dimensions.map((dimension) => DIMENSION_LABELS[dimension] ?? dimension).join(', ')
}

export async function analyzeContentCompletenessWithAi(context: AnalyzerContext, hook: CompletenessAiHook): Promise<RawFinding[]> {
  const candidates = context.eligiblePages
    .filter(({ page, extractionConfidence }) => extractionConfidence === 'high' && page.content_word_count >= MIN_WORDS_TO_CONSIDER_FOR_AI)
    .sort((a, b) => b.page.content_word_count - a.page.content_word_count)

  const selected = candidates.slice(0, AI_MAX_PAGES_PER_ANALYSIS)
  if (selected.length === 0) return []

  const opportunityInstances: RawFindingPageEvidence[] = []
  const startedAt = Date.now()
  let pagesActuallyReviewed = 0

  for (const { page, pageType } of selected) {
    // Bounded/fail-soft wall-clock guard — see AI_WALL_CLOCK_BUDGET_MS's own
    // doc comment. Stops making FURTHER calls once the budget is spent;
    // never retroactively discards results already collected.
    if (Date.now() - startedAt >= AI_WALL_CLOCK_BUDGET_MS) break

    let result: CompletenessInterpretationResult
    try {
      result = await hook({ url: page.url, pageType: pageType.type, title: page.title, h1Text: page.h1_text, contentText: page.content_text })
    } catch {
      continue // isolated -- one page's AI failure never blocks the others or the deterministic analysis
    }
    pagesActuallyReviewed++

    if (result.status !== 'interpreted' || result.missingDimensions.length === 0) continue

    const instance: RawFindingPageEvidence = {
      url: page.url,
      currentState: { label: 'Possibly missing information', value: describeMissingDimensions(result.missingDimensions) },
      detail: { missingDimensions: result.missingDimensions, aiConfidence: result.confidence, explanation: result.explanation, evidenceSource: 'ai_interpreted' },
    }

    // INITIAL RELEASE POLICY: every result becomes an opportunity — see
    // this module's own doc comment for why even the AI's own 'high'
    // self-reported confidence is not yet trusted enough to affect score.
    opportunityInstances.push(instance)
  }

  const findings: RawFinding[] = []
  const coveragePrefix = `AI-assisted review covered ${pagesActuallyReviewed} of ${candidates.length} substantive page${candidates.length === 1 ? '' : 's'} eligible for this review`
  const coverageSuffix =
    candidates.length > pagesActuallyReviewed
      ? ", bounded by this analysis's per-run review limit and/or time budget — the remaining eligible pages were not reviewed this pass."
      : '.'

  if (opportunityInstances.length > 0) {
    findings.push({
      checkKey: 'content_completeness_opportunity',
      category: 'completeness',
      scope: 'page',
      kind: 'opportunity',
      evidenceSource: 'ai_interpreted',
      baseSeverity: 'low',
      confidence: 'low',
      title: 'Pages could add more explanatory information',
      explanation: `${opportunityInstances.length} page${opportunityInstances.length === 1 ? '' : 's'} could potentially cover a bit more ground for visitors. ${coveragePrefix}${coverageSuffix}`,
      whyItMatters: 'These are lower-confidence suggestions for already-adequate content, not signs anything is wrong.',
      recommendation: 'Optionally review the identified pages for the specific suggestions in each page\'s evidence.',
      evidence: { pagesReviewed: pagesActuallyReviewed, pagesEligible: candidates.length },
      affectedPages: opportunityInstances,
    })
  }

  return findings
}
