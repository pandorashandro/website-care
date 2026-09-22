import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/content/types'
import type { ContentAnalysisCoverage } from '@/lib/content/coverage'
import type { CategorySummary, CoverageLevel } from '@/lib/category-engine/types'

const NOT_ANALYZED: CategorySummary = {
  categoryKey: 'content',
  status: 'not_analyzed',
  score: null,
  findingsCount: null,
  partial: false,
  analyzedAt: null,
  analyzerVersion: null,
}

type CrawlRunForSummary = { id: string; status: string } | null
type AnalysisForSummary = {
  health_score: number | null
  findings_count: number
  completed_at: string | null
  analyzer_version: string
  /**
   * Evidence-aware health scoring (2026-09-22) — Content Intelligence ALREADY
   * computes and persists this (lib/content/coverage.ts, since Phase 29) —
   * this is the FIRST time it reaches Overview's Category Health tile at
   * all (previously selected in unified-summary.ts's own SQL, then silently
   * dropped before reaching this function — see that file's own comment).
   * Deliberately NOT a second coverage model: `eligiblePageCount === 0` is
   * read directly off Content's own existing record, never recomputed.
   */
  coverage?: ContentAnalysisCoverage | null
} | null

/** Content's own high/medium/low vocabulary collapses onto the shared none/low/adequate scale ONLY for Overview's tile — Content's dedicated page keeps showing its own richer percent/level via CoverageIndicator, untouched. */
function toSharedCoverageLevel(coverage: ContentAnalysisCoverage): CoverageLevel {
  if (coverage.eligiblePageCount === 0) return 'none'
  return coverage.level === 'high' ? 'adequate' : 'low'
}

/**
 * Phase 29 — pure (no I/O) mapping from the raw crawl_run/crawl_analyses
 * rows to the reusable CategorySummary shape, mirroring
 * on-page-summary.ts's buildOnPageCategorySummary exactly. Unit-tested
 * without a live Supabase — see tests/content-category-summary.test.ts.
 *
 * Never accepts or reads anything from the legacy scanner's
 * calculate-health-score.ts categories (the old generic "content" score) —
 * there is no such parameter. The legacy 'content' category tile is
 * replaced by this canonical one in Overview (see
 * components/report/category-score-grid.tsx), exactly as 'seo' was
 * replaced by canonical On-Page SEO in Phase 28.
 */
export function buildContentCategorySummary(crawlRun: CrawlRunForSummary, analysis: AnalysisForSummary): CategorySummary {
  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return NOT_ANALYZED
  }

  if (!analysis || analysis.health_score === null) {
    return NOT_ANALYZED
  }

  // Evidence-aware health scoring (2026-09-22): eligiblePageCount === 0
  // means ZERO pages were eligible for content analysis at all — the
  // persisted health_score in that case is a hollow, unguarded 100 (see
  // lib/content/health.ts). This mirrors exactly how On-Page/Technical
  // SEO/Architecture/Pillars all treat their own 'none' coverage case —
  // Content's OWN coverage record already carries this fact, this is only
  // the first time Overview's tile actually reads it.
  if (analysis.coverage && analysis.coverage.eligiblePageCount === 0) {
    return NOT_ANALYZED
  }

  return {
    categoryKey: 'content',
    status: 'analyzed',
    score: analysis.health_score,
    findingsCount: analysis.findings_count,
    partial: crawlRun.status === 'partial',
    analyzedAt: analysis.completed_at,
    analyzerVersion: analysis.analyzer_version,
    coverage: analysis.coverage ? toSharedCoverageLevel(analysis.coverage) : null,
  }
}

/**
 * The ONE server-side retrieval of the authoritative Content Intelligence
 * analysis for Overview's Category Health tile — a thin wrapper around
 * buildContentCategorySummary's pure mapping. Reads exactly the same
 * crawl_runs -> crawl_analyses (by crawl_run_id + analyzer_version) rows
 * the dedicated Content page reads.
 */
export async function getContentCategorySummary(websiteId: string): Promise<CategorySummary> {
  const supabase = await createClient()

  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, status')
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return buildContentCategorySummary(null, null)
  }

  const { data: analysis } = await supabase
    .from('crawl_analyses')
    .select('health_score, findings_count, completed_at, analyzer_version, coverage')
    .eq('crawl_run_id', crawlRun.id)
    .eq('analyzer_version', ANALYZER_VERSION)
    .maybeSingle()

  return buildContentCategorySummary(crawlRun, analysis)
}
