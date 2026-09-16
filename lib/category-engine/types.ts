/**
 * Phase 26B correction — the reusable read-model shape a future Overview
 * "Category Health" card renders for ANY canonical category engine
 * (Technical SEO, and eventually On-Page SEO, Content, Site Architecture,
 * Performance, Accessibility, Security), without recomputing that
 * category's own analysis. Technical SEO (lib/technical-seo/) is the first
 * real implementation — see
 * app/dashboard/websites/[id]/technical-seo-summary.ts.
 *
 * Deliberately lean (per this correction's own "do not over-engineer"
 * instruction): only what Overview's existing Category Health tile
 * actually needs — a score/status pair, a finding count, partial-crawl
 * honesty, and enough version/timestamp metadata to know WHICH analysis
 * produced this summary. The full findings/evidence/remediation model
 * stays on the dedicated category page alone; it is never duplicated here.
 */
export type CategorySummaryStatus = 'not_analyzed' | 'analyzed'

export type CategorySummary = {
  categoryKey: string
  status: CategorySummaryStatus
  score: number | null
  findingsCount: number | null
  /** True when the underlying analysis covered only part of the site (e.g. a plan page-limit-truncated crawl) — never silently hidden from a summary view. */
  partial: boolean
  analyzedAt: string | null
  analyzerVersion: string | null
}
