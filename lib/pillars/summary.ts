import type { CategorySummary } from '@/lib/category-engine/types'

type CrawlRunForSummary = { id: string; status: string } | null
type AnalysisForSummary = { health_score: number | null; findings_count: number; completed_at: string | null; analyzer_version: string } | null

/**
 * Unified webioom engine, Prompt 2 — the ONE pure category-summary mapping
 * function shared by Performance/Accessibility/Security, mirroring every
 * earlier engine's own `buildXCategorySummary(crawlRun, analysis)` exactly
 * (see e.g. app/dashboard/websites/[id]/content-summary.ts) but
 * parameterized by `categoryKey` since all three are structurally
 * identical. Never reads anything from the legacy scanner's own
 * calculate-health-score.ts categories.
 */
export function buildPillarCategorySummary(categoryKey: string, crawlRun: CrawlRunForSummary, analysis: AnalysisForSummary): CategorySummary {
  const notAnalyzed: CategorySummary = { categoryKey, status: 'not_analyzed', score: null, findingsCount: null, partial: false, analyzedAt: null, analyzerVersion: null }

  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) return notAnalyzed
  if (!analysis || analysis.health_score === null) return notAnalyzed

  return {
    categoryKey,
    status: 'analyzed',
    score: analysis.health_score,
    findingsCount: analysis.findings_count,
    partial: crawlRun.status === 'partial',
    analyzedAt: analysis.completed_at,
    analyzerVersion: analysis.analyzer_version,
  }
}
