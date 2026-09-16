import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/technical-seo/types'
import type { CategorySummary } from '@/lib/category-engine/types'

const NOT_ANALYZED: CategorySummary = {
  categoryKey: 'technical_seo',
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
 * Phase 26B correction — pure (no I/O) mapping from the raw crawl_run/
 * crawl_analyses rows to the reusable CategorySummary shape. Exported
 * specifically so this decision logic (what counts as "not analyzed,"
 * which raw field maps to which summary field) is unit-testable without a
 * live Supabase — mirrors this codebase's established "test the pure
 * logic, not the DB-touching wrapper around it" convention (e.g.
 * lib/entitlements/subscription.ts's resolveEntitlements vs.
 * lib/entitlements/service.ts's thin wrapper).
 *
 * Never accepts or reads anything from the legacy scanner's
 * `calculate-health-score.ts` categories — there is no such parameter,
 * making it structurally impossible for this function to fall back to
 * `categories.technical`.
 */
export function buildTechnicalSeoCategorySummary(crawlRun: CrawlRunForSummary, analysis: AnalysisForSummary): CategorySummary {
  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return NOT_ANALYZED
  }

  if (!analysis || analysis.health_score === null) {
    return NOT_ANALYZED
  }

  return {
    categoryKey: 'technical_seo',
    status: 'analyzed',
    score: analysis.health_score,
    findingsCount: analysis.findings_count,
    partial: crawlRun.status === 'partial',
    analyzedAt: analysis.completed_at,
    analyzerVersion: analysis.analyzer_version,
  }
}

/**
 * The ONE server-side retrieval of the authoritative Technical SEO
 * analysis for Overview's Category Health tile — a thin wrapper around
 * buildTechnicalSeoCategorySummary's pure mapping. Reads exactly the same
 * crawl_runs -> crawl_analyses (by crawl_run_id + analyzer_version) rows
 * the dedicated Technical SEO page reads for its own header (see
 * app/dashboard/websites/[id]/technical-seo/page.tsx) — never a second,
 * independently-computed score. Overview calls this ONCE; nothing else in
 * the Overview page queries crawl_runs/crawl_analyses for Technical SEO
 * data.
 */
export async function getTechnicalSeoCategorySummary(websiteId: string): Promise<CategorySummary> {
  const supabase = await createClient()

  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, status')
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return buildTechnicalSeoCategorySummary(null, null)
  }

  const { data: analysis } = await supabase
    .from('crawl_analyses')
    .select('health_score, findings_count, completed_at, analyzer_version')
    .eq('crawl_run_id', crawlRun.id)
    .eq('analyzer_version', ANALYZER_VERSION)
    .maybeSingle()

  return buildTechnicalSeoCategorySummary(crawlRun, analysis)
}
