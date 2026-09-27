import type { CategorySummaryStatus } from '@/lib/category-engine/types'

/**
 * WEBIOOM Product Analytics — `report_viewed` eligibility.
 *
 * `report_viewed` means a user viewed the main website Overview page while
 * it contained genuine analyzed audit results — never merely that the page
 * was navigated to. The authoritative, ALREADY-EXISTING signal for "does
 * this category have real analyzed evidence" is each canonical category's
 * own `CategorySummary.status` (see lib/category-engine/types.ts), the SAME
 * field `app/dashboard/websites/[id]/page.tsx` already reads to compute its
 * own `allCategoriesAnalyzed` (all seven analyzed). This is deliberately
 * the weaker "at least one" condition, not "all seven" — WEBIOOM legitimately
 * shows a genuine, eligible report with incomplete pillar coverage (and a
 * withheld/null overall score — see docs/scoring-contract-v1.md), so
 * requiring full coverage or a non-null score here would invent a stricter
 * definition of "viewed a report" than the product itself uses.
 *
 * Deliberately typed against only the one field this needs (`status`),
 * rather than the full `CategorySummary` shape, so this stays usable
 * wherever a category-summary-like value is available without importing
 * unrelated fields (score, findings, coverage) analytics must never touch.
 */
export function hasAnalyzedCategory(summaries: readonly { status: CategorySummaryStatus }[]): boolean {
  return summaries.some((summary) => summary.status === 'analyzed')
}
