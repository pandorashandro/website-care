import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/architecture/types'
import type { ArchitectureCoverage } from '@/lib/architecture/coverage'
import type { CategorySummary } from '@/lib/category-engine/types'

const NOT_ANALYZED: CategorySummary = {
  categoryKey: 'site_architecture',
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
  /** Evidence-aware health scoring (2026-09-22) — see lib/architecture/coverage.ts. Optional so callers that don't select this column remain valid — absent is treated identically to null, i.e. "unknown/legacy," never assumed 'none'. */
  coverage?: ArchitectureCoverage | null
} | null

/**
 * Phase 27 — pure (no I/O) mapping from the raw crawl_run/crawl_analyses
 * rows to the reusable CategorySummary shape, mirroring
 * technical-seo-summary.ts's buildTechnicalSeoCategorySummary exactly.
 * Unit-tested without a live Supabase — see
 * tests/architecture-category-summary.test.ts.
 *
 * Never accepts or reads anything from the legacy scanner's
 * calculate-health-score.ts categories, or from Technical SEO's own
 * analysis — there is no such parameter, making it structurally impossible
 * for this function to fall back to an unrelated score.
 */
export function buildSiteArchitectureCategorySummary(crawlRun: CrawlRunForSummary, analysis: AnalysisForSummary): CategorySummary {
  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return NOT_ANALYZED
  }

  if (!analysis || analysis.health_score === null) {
    return NOT_ANALYZED
  }

  // Evidence-aware health scoring (2026-09-22): coverage 'none' means ZERO
  // pages were eligible to build a page graph from at all — see
  // lib/architecture/coverage.ts. The persisted health_score in that case
  // is a hollow, unguarded 100 (no orphan/underlinked/dead-end check could
  // possibly have found anything to evaluate).
  //
  // Scoring Engine V1 calibration (2026-09-24): 'low' (exactly 1 eligible
  // page) is now WITHHELD too, not merely capped. Every graph-shaped check
  // (orphan/underlinked/dead-end) requires at least 2 eligible pages to
  // have ANY real relationship to evaluate (see dead-ends.ts's own doc
  // comment) — with only 1, there is no applicable check left to have
  // earned a score from, so a numeric result here would still be "we
  // scored this," when the true fact is "there is nothing yet for this
  // pillar to assess." See docs/scoring-contract-v1.md.
  if (analysis.coverage?.level === 'none' || analysis.coverage?.level === 'low') {
    return NOT_ANALYZED
  }

  return {
    categoryKey: 'site_architecture',
    status: 'analyzed',
    score: analysis.health_score,
    findingsCount: analysis.findings_count,
    partial: crawlRun.status === 'partial',
    analyzedAt: analysis.completed_at,
    analyzerVersion: analysis.analyzer_version,
    coverage: analysis.coverage?.level ?? null,
  }
}

/**
 * The ONE server-side retrieval of the authoritative Site Architecture
 * analysis for Overview's Category Health tile — a thin wrapper around
 * buildSiteArchitectureCategorySummary's pure mapping. Reads exactly the
 * same crawl_runs -> crawl_analyses (by crawl_run_id + analyzer_version)
 * rows the dedicated Site Architecture page reads for its own header —
 * never a second, independently-computed score. Note `crawl_analyses` is
 * the SAME table Technical SEO's summary reads; the two never collide
 * because they filter on different `analyzer_version` values.
 */
export async function getSiteArchitectureCategorySummary(websiteId: string): Promise<CategorySummary> {
  const supabase = await createClient()

  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, status')
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return buildSiteArchitectureCategorySummary(null, null)
  }

  const { data: analysis } = await supabase
    .from('crawl_analyses')
    .select('health_score, findings_count, completed_at, analyzer_version, coverage')
    .eq('crawl_run_id', crawlRun.id)
    .eq('analyzer_version', ANALYZER_VERSION)
    .maybeSingle()

  return buildSiteArchitectureCategorySummary(crawlRun, analysis)
}
