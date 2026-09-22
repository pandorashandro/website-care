import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/on-page/types'
import type { OnPageAnalysisCoverage } from '@/lib/on-page/coverage'
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
type AnalysisForSummary = {
  health_score: number | null
  findings_count: number
  completed_at: string | null
  analyzer_version: string
  /** Founder-reported bug (2026-09-22) — see lib/on-page/coverage.ts. Optional (not just nullable) so callers that don't select this column (it's a recent addition) remain valid — absent is treated identically to null, i.e. "unknown/legacy," never assumed 'none'. */
  coverage?: OnPageAnalysisCoverage | null
} | null

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

  // Founder-reported bug (2026-09-22): a coverage level of 'none' means
  // ZERO pages were actually eligible for on-page analysis (e.g. the only
  // fetched page was blocked/403, or noindexed) — the persisted
  // health_score is a hollow, unguarded "100" in that case (see
  // lib/on-page/health.ts's own doc comment on why zero findings always
  // yields 100), not a genuine "verified clean" result. Reporting this
  // exactly like NOT_ANALYZED means Overview's Category Health tile never
  // shows a false "Excellent" score for a crawl that couldn't actually see
  // the site, AND it makes computeOverallWebsiteHealth's own existing
  // "skip not_analyzed categories" rule correctly exclude this hollow score
  // from the site-wide average — no change needed to that aggregator at
  // all. A coverage level of 'low' (exactly 1 eligible page) is NOT treated
  // this way: a single real page's title/meta/H1 checks are still genuine
  // evidence, just without duplicate-check coverage (see the dedicated
  // report page's own caveat for that).
  if (analysis.coverage?.level === 'none') {
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
    // OnPageCoverageLevel ('none'|'low'|'adequate') is the exact same
    // vocabulary as the shared CoverageLevel — no translation needed.
    coverage: analysis.coverage?.level ?? null,
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
    .select('health_score, findings_count, completed_at, analyzer_version, coverage')
    .eq('crawl_run_id', crawlRun.id)
    .eq('analyzer_version', ANALYZER_VERSION)
    .maybeSingle()

  return buildOnPageCategorySummary(crawlRun, analysis)
}
