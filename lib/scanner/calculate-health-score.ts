import { aggregateIssues, type RawIssueRow } from './aggregate-issues'

export type { RawIssueRow }

const KNOWN_CATEGORIES = ['seo', 'technical', 'accessibility', 'performance', 'content'] as const
export type Category = (typeof KNOWN_CATEGORIES)[number]

export type CategoryScores = Record<Category, number>

export type HealthScore = {
  overall: number
  categories: CategoryScores
}

function isKnownCategory(type: string): type is Category {
  return (KNOWN_CATEGORIES as readonly string[]).includes(type)
}

const SEVERITY_DEDUCTION: Record<string, number> = {
  critical: 30,
  high: 20,
  medium: 10,
  low: 5,
}

/** 1 page = 1.0, 2–3 = 1.25, 4–7 = 1.5, 8–14 = 1.75, 15+ = 2.0 */
function spreadMultiplier(affectedPageCount: number): number {
  if (affectedPageCount >= 15) return 2.0
  if (affectedPageCount >= 8) return 1.75
  if (affectedPageCount >= 4) return 1.5
  if (affectedPageCount >= 2) return 1.25
  return 1.0
}

const HOMEPAGE_MULTIPLIER = 1.15

const CATEGORY_WEIGHTS: CategoryScores = {
  seo: 0.3,
  technical: 0.3,
  accessibility: 0.15,
  performance: 0.15,
  content: 0.1,
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

/**
 * Computes per-category and overall website health scores from raw issue
 * rows, reusing the same grouping that powers "Fix These First"
 * (aggregateIssues: title/type/severity identity, deduplicated affected
 * pages, homepage detection via normalized-URL comparison) — so the two
 * features agree on what counts as one issue and which pages it affects,
 * even though they score it for different purposes (ranking vs. health).
 *
 * Each aggregated group is deducted once — not once per raw issue instance —
 * so a widespread issue costs more than a one-off one without scaling
 * linearly with page count (see spreadMultiplier).
 *
 * Issue types outside {seo, technical, accessibility, performance, content}
 * are ignored for category scoring (they don't reduce any category, and are
 * excluded from the overall weighting) rather than being silently folded
 * into an existing category.
 */
export function calculateHealthScore(rawIssues: RawIssueRow[], websiteUrl: string): HealthScore {
  const groups = aggregateIssues(rawIssues, websiteUrl)

  const deductionTotals: CategoryScores = {
    seo: 0,
    technical: 0,
    accessibility: 0,
    performance: 0,
    content: 0,
  }

  for (const group of groups) {
    if (!isKnownCategory(group.type)) continue

    const base = SEVERITY_DEDUCTION[group.severity] ?? 0
    const multiplier = spreadMultiplier(group.affectedPageCount)
    const homepageMultiplier = group.homepageAffected ? HOMEPAGE_MULTIPLIER : 1

    deductionTotals[group.type] += Math.round(base * multiplier * homepageMultiplier)
  }

  const categories: CategoryScores = {
    seo: clampScore(100 - deductionTotals.seo),
    technical: clampScore(100 - deductionTotals.technical),
    accessibility: clampScore(100 - deductionTotals.accessibility),
    performance: clampScore(100 - deductionTotals.performance),
    content: clampScore(100 - deductionTotals.content),
  }

  const weightedSum = KNOWN_CATEGORIES.reduce(
    (sum, category) => sum + categories[category] * CATEGORY_WEIGHTS[category],
    0
  )

  return { overall: clampScore(Math.round(weightedSum)), categories }
}
