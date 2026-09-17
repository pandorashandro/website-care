import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/on-page/types'
import type { CategorySummary } from '@/lib/category-engine/types'

const NOT_ANALYZED: CategorySummary = {
  categoryKey: 'on_page_seo',
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
 * Phase 28 — pure (no I/O) mapping from the raw crawl_run/crawl_analyses
 * rows to the reusable CategorySummary shape, mirroring
 * site-architecture-summary.ts's buildSiteArchitectureCategorySummary
 * exactly. Unit-tested without a live Supabase — see
 * tests/on-page-category-summary.test.ts.
 *
 * Never accepts or reads anything from the legacy scanner's
 * calculate-health-score.ts categories (the old generic "seo" score) — there
 * is no such parameter, making it structurally impossible for this function
 * to fall back to that unrelated score. This is exactly the replacement
 * this phase's own instructions require: the legacy "SEO" category becomes
 * canonical On-Page SEO once this authoritative analysis exists, never a
 * second, competing category shown alongside it.
 */
export function buildOnPageCategorySummary(crawlRun: CrawlRunForSummary, analysis: AnalysisForSummary): CategorySummary {
  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return NOT_ANALYZED
  }

  if (!analysis || analysis.health_score === null) {
    return NOT_ANALYZED
  }

  return {
    categoryKey: 'on_page_seo',
    status: 'analyzed',
    score: analysis.health_score,
    findingsCount: analysis.findings_count,
    partial: crawlRun.status === 'partial',
    analyzedAt: analysis.completed_at,
    analyzerVersion: analysis.analyzer_version,
  }
}

/**
 * The ONE server-side retrieval of the authoritative On-Page SEO analysis
 * for Overview's Category Health tile — a thin wrapper around
 * buildOnPageCategorySummary's pure mapping. Reads exactly the same
 * crawl_runs -> crawl_analyses (by crawl_run_id + analyzer_version) rows the
 * dedicated On-Page SEO page reads for its own header — never a second,
 * independently-computed score.
 */
export async function getOnPageCategorySummary(websiteId: string): Promise<CategorySummary> {
  const supabase = await createClient()

  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, status')
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return buildOnPageCategorySummary(null, null)
  }

  const { data: analysis } = await supabase
    .from('crawl_analyses')
    .select('health_score, findings_count, completed_at, analyzer_version')
    .eq('crawl_run_id', crawlRun.id)
    .eq('analyzer_version', ANALYZER_VERSION)
    .maybeSingle()

  return buildOnPageCategorySummary(crawlRun, analysis)
}
