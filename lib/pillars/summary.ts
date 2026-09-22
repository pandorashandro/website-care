import type { CategorySummary } from '@/lib/category-engine/types'
import type { PillarCoverage } from './coverage'

type CrawlRunForSummary = { id: string; status: string } | null
type AnalysisForSummary = {
  health_score: number | null
  findings_count: number
  completed_at: string | null
  analyzer_version: string
  /** Evidence-aware health scoring (2026-09-22) — see lib/pillars/coverage.ts. Optional so callers that don't select this column remain valid — absent is treated identically to null, i.e. "unknown/legacy," never assumed 'none'. */
  coverage?: PillarCoverage | null
} | null

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

  // Evidence-aware health scoring (2026-09-22): coverage 'none' means ZERO
  // pages were eligible for this pillar's checks — see lib/pillars/coverage.ts.
  // The persisted health_score in that case is a hollow, unguarded 100.
  if (analysis.coverage?.level === 'none') return notAnalyzed

  return {
    categoryKey,
    status: 'analyzed',
    score: analysis.health_score,
    findingsCount: analysis.findings_count,
    partial: crawlRun.status === 'partial',
    analyzedAt: analysis.completed_at,
    analyzerVersion: analysis.analyzer_version,
    coverage: analysis.coverage?.level ?? null,
  }
}
