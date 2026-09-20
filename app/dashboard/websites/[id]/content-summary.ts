import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/content/types'
import type { CategorySummary } from '@/lib/category-engine/types'

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
type AnalysisForSummary = { health_score: number | null; findings_count: number; completed_at: string | null; analyzer_version: string } | null

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

  return {
    categoryKey: 'content',
    status: 'analyzed',
    score: analysis.health_score,
    findingsCount: analysis.findings_count,
    partial: crawlRun.status === 'partial',
    analyzedAt: analysis.completed_at,
    analyzerVersion: analysis.analyzer_version,
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
    .select('health_score, findings_count, completed_at, analyzer_version')
    .eq('crawl_run_id', crawlRun.id)
    .eq('analyzer_version', ANALYZER_VERSION)
    .maybeSingle()

  return buildContentCategorySummary(crawlRun, analysis)
}
