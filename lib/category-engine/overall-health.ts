import type { CategorySummary } from './types'

/**
 * Unified webioom engine — OVERALL WEBSITE HEALTH.
 *
 * A single, deterministic aggregation of whichever CANONICAL category
 * engines have a genuine, evidence-backed score from the SAME crawl —
 * never a second independent scoring computation, never a guess for a
 * category that has no analysis yet.
 *
 * RULE (deliberately the simplest defensible aggregation, not a weighted
 * model): the overall score is the plain, unweighted mean of every
 * canonical category's `health_score` that is currently `status ===
 * 'analyzed'` with a non-null `score`. A category with no analysis yet
 * (`status: 'not_analyzed'`) is EXCLUDED from the average entirely — it
 * never contributes a fabricated 0 (which would look like a real, terrible
 * score) or a fabricated 100 (which would look like a real, perfect score).
 * `contributingCategoryCount`/`totalCanonicalCategories` are always
 * returned alongside the score so the UI can honestly say "based on 3 of 4
 * canonical categories" rather than implying a full 7-category assessment.
 *
 * SCOPE: this function only ever receives the CANONICAL, crawl-based
 * category summaries (Technical SEO, On-Page SEO, Site Architecture,
 * Content) — never the legacy single-homepage-page scanner's
 * Accessibility/Performance categories, and never a fabricated Security
 * entry. Mixing a legacy, single-page-scan-derived score into this average
 * would violate the "one coherent website-analysis/crawl generation"
 * requirement (the legacy scan and the canonical crawl are two different,
 * independently-timed analyses) — see
 * app/dashboard/websites/[id]/unified-summary.ts, which is the ONLY
 * intended caller, for how the four summaries passed in here are resolved
 * from one single crawl_run.
 *
 * WHY UNWEIGHTED: a defensible starting point per this phase's own explicit
 * "choose the simplest defensible aggregation... don't overengineer
 * weighting" instruction. The shape (`contributingCategoryCount`,
 * `totalCanonicalCategories`) is deliberately future-proof: a later phase
 * can swap the plain mean for a weighted one without changing this
 * function's signature or any caller.
 */
export type OverallWebsiteHealth = {
  score: number | null
  contributingCategoryCount: number
  totalCanonicalCategories: number
}

export function computeOverallWebsiteHealth(categorySummaries: CategorySummary[]): OverallWebsiteHealth {
  const scored = categorySummaries.filter((summary): summary is CategorySummary & { score: number } => summary.status === 'analyzed' && typeof summary.score === 'number')

  if (scored.length === 0) {
    return { score: null, contributingCategoryCount: 0, totalCanonicalCategories: categorySummaries.length }
  }

  const average = scored.reduce((sum, summary) => sum + summary.score, 0) / scored.length

  return {
    score: Math.round(average),
    contributingCategoryCount: scored.length,
    totalCanonicalCategories: categorySummaries.length,
  }
}
