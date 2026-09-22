import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION as TECHNICAL_SEO_ANALYZER_VERSION } from '@/lib/technical-seo/types'
import { ANALYZER_VERSION as ON_PAGE_ANALYZER_VERSION } from '@/lib/on-page/types'
import { ANALYZER_VERSION as ARCHITECTURE_ANALYZER_VERSION } from '@/lib/architecture/types'
import { ANALYZER_VERSION as CONTENT_ANALYZER_VERSION } from '@/lib/content/types'
import { PERFORMANCE_ANALYZER_VERSION, ACCESSIBILITY_ANALYZER_VERSION, SECURITY_ANALYZER_VERSION } from '@/lib/pillars/types'
import { buildTechnicalSeoCategorySummary } from './technical-seo-summary'
import { buildOnPageCategorySummary } from './on-page-summary'
import { buildSiteArchitectureCategorySummary } from './site-architecture-summary'
import { buildContentCategorySummary } from './content-summary'
import { buildPillarCategorySummary } from '@/lib/pillars/summary'
import type { CategorySummary } from '@/lib/category-engine/types'

/**
 * Unified webioom engine — the ONE place Overview resolves all SEVEN
 * canonical category summaries from a SINGLE crawl_run.
 *
 * WHY THIS EXISTS (as opposed to Overview calling each category's own
 * `getXCategorySummary(websiteId)` independently, as it did before): each
 * of those wrappers independently re-queries "the latest crawl_run for
 * this website" itself. In practice that almost always resolves to the
 * same row (a website has at most one non-terminal crawl_run at a time),
 * but the product contract for the unified engine is explicit: Category
 * Health "must reference one coherent website-analysis/crawl generation"
 * and must "not mix stale category results from unrelated crawls." This
 * function makes that a structural GUARANTEE rather than an incidental
 * consequence of timing: it fetches the latest crawl_run exactly ONCE, then
 * resolves all seven categories' `crawl_analyses` rows for that exact
 * `crawl_run_id` in a SINGLE query.
 *
 * NOT a second scoring engine: every summary is still produced by that
 * category's own existing, already-tested PURE builder function — this
 * module only changes WHERE the underlying rows come from (one shared
 * crawl_run/one shared query), never HOW a score is derived from them.
 *
 * Prompt 2 — extended from four to all seven canonical categories
 * (Performance/Accessibility/Security joined Technical SEO/On-Page
 * SEO/Site Architecture/Content, all now genuinely analyzed from the same
 * crawl — see lib/performance, lib/accessibility, lib/security).
 */
export type UnifiedCategorySummaries = {
  crawlRun: { id: string; status: string } | null
  technicalSeo: CategorySummary
  onPageSeo: CategorySummary
  siteArchitecture: CategorySummary
  content: CategorySummary
  performance: CategorySummary
  accessibility: CategorySummary
  security: CategorySummary
}

const NOT_ANALYZED_ALL = {
  technicalSeo: buildTechnicalSeoCategorySummary(null, null),
  onPageSeo: buildOnPageCategorySummary(null, null),
  siteArchitecture: buildSiteArchitectureCategorySummary(null, null),
  content: buildContentCategorySummary(null, null),
  performance: buildPillarCategorySummary('performance', null, null),
  accessibility: buildPillarCategorySummary('accessibility', null, null),
  security: buildPillarCategorySummary('security', null, null),
}

/** The seven canonical analyzer_version values, in the SAME order the seven CategorySummary fields above are keyed — reused directly as the ordered list `computeOverallWebsiteHealth`'s caller (Overview) needs. */
export const ALL_CANONICAL_ANALYZER_VERSIONS = [
  TECHNICAL_SEO_ANALYZER_VERSION,
  ON_PAGE_ANALYZER_VERSION,
  ARCHITECTURE_ANALYZER_VERSION,
  CONTENT_ANALYZER_VERSION,
  PERFORMANCE_ANALYZER_VERSION,
  ACCESSIBILITY_ANALYZER_VERSION,
  SECURITY_ANALYZER_VERSION,
]

export async function getUnifiedCategorySummaries(websiteId: string): Promise<UnifiedCategorySummaries> {
  const supabase = await createClient()

  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, status')
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!crawlRun || (crawlRun.status !== 'completed' && crawlRun.status !== 'partial')) {
    return { crawlRun: crawlRun ?? null, ...NOT_ANALYZED_ALL }
  }

  const { data: analyses } = await supabase
    .from('crawl_analyses')
    .select('analyzer_version, health_score, findings_count, completed_at, coverage')
    .eq('crawl_run_id', crawlRun.id)
    .in('analyzer_version', ALL_CANONICAL_ANALYZER_VERSIONS)

  const byVersion = new Map((analyses ?? []).map((row) => [row.analyzer_version, row]))

  return {
    crawlRun,
    technicalSeo: buildTechnicalSeoCategorySummary(crawlRun, byVersion.get(TECHNICAL_SEO_ANALYZER_VERSION) ?? null),
    onPageSeo: buildOnPageCategorySummary(crawlRun, byVersion.get(ON_PAGE_ANALYZER_VERSION) ?? null),
    siteArchitecture: buildSiteArchitectureCategorySummary(crawlRun, byVersion.get(ARCHITECTURE_ANALYZER_VERSION) ?? null),
    content: buildContentCategorySummary(crawlRun, byVersion.get(CONTENT_ANALYZER_VERSION) ?? null),
    performance: buildPillarCategorySummary('performance', crawlRun, byVersion.get(PERFORMANCE_ANALYZER_VERSION) ?? null),
    accessibility: buildPillarCategorySummary('accessibility', crawlRun, byVersion.get(ACCESSIBILITY_ANALYZER_VERSION) ?? null),
    security: buildPillarCategorySummary('security', crawlRun, byVersion.get(SECURITY_ANALYZER_VERSION) ?? null),
  }
}
