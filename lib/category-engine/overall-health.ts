import type { CategorySummary } from './types'

/**
 * Unified webioom engine — OVERALL WEBSITE HEALTH.
 *
 * Scoring Engine V1 contract (2026-09-24) — see docs/scoring-contract-v1.md
 * for the full written specification this function implements. Summary:
 *
 * Overall Website Health is a SINGLE NUMBER with exactly two states:
 *
 *   COMPLETE  — every one of the seven canonical pillars is `status:
 *   'analyzed'` with a numeric score AND `coverage: 'adequate'` (never
 *   'low'/'none', never a missing/null coverage value — see
 *   lib/category-engine/types.ts's own doc comment on why a missing
 *   coverage value is never treated as a green light). In this state, and
 *   ONLY in this state:
 *
 *       score = round(
 *         (TechnicalSEO + OnPageSEO + SiteArchitecture + Content +
 *          Performance + Accessibility + Security) / 7
 *       )
 *
 *   No weighting, no eighth pillar, no penalty beyond what each pillar
 *   already earned on its own.
 *
 *   WITHHELD — anything less than all seven fully, adequately evidenced.
 *   `score` is `null`. There is no partial mean, no discounted number, no
 *   "Limited 91" — a customer-facing number that looks precise but is
 *   built from fewer than seven fully-supported pillars communicates more
 *   certainty than webioom possesses, which this contract exists
 *   specifically to prevent (this superseded an earlier "Limited N" state
 *   that still displayed a raw partial-mean number next to a badge — audited
 *   and found insufficient: the number itself, not just its label, was the
 *   overclaim).
 *
 * `contributingCategoryCount`/`totalCanonicalCategories` are ALWAYS
 * returned, in both states, as an internal diagnostic the UI may use to
 * explain WHY the score is withheld ("4 of 7 pillars have enough evidence
 * so far") — they are never displayed as though they were the score itself.
 *
 * SCOPE: this function only ever receives the CANONICAL, crawl-based
 * category summaries for all seven pillars, resolved from ONE crawl_run —
 * see app/dashboard/websites/[id]/unified-summary.ts, the only intended
 * caller. Never a second, independent scoring computation.
 */
export type OverallWebsiteHealth = {
  score: number | null
  contributingCategoryCount: number
  totalCanonicalCategories: number
}

export function computeOverallWebsiteHealth(categorySummaries: CategorySummary[]): OverallWebsiteHealth {
  const scored = categorySummaries.filter((summary): summary is CategorySummary & { score: number } => summary.status === 'analyzed' && typeof summary.score === 'number')
  const contributingCategoryCount = scored.length
  const totalCanonicalCategories = categorySummaries.length

  const fullyEvidenced = categorySummaries.length > 0 && categorySummaries.every((summary) => summary.status === 'analyzed' && typeof summary.score === 'number' && summary.coverage === 'adequate')

  if (!fullyEvidenced) {
    return { score: null, contributingCategoryCount, totalCanonicalCategories }
  }

  const average = scored.reduce((sum, summary) => sum + summary.score, 0) / scored.length

  return {
    score: Math.round(average),
    contributingCategoryCount,
    totalCanonicalCategories,
  }
}
