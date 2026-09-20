import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION as TECHNICAL_SEO_ANALYZER_VERSION } from '@/lib/technical-seo/types'
import { ANALYZER_VERSION as ON_PAGE_ANALYZER_VERSION } from '@/lib/on-page/types'
import { ANALYZER_VERSION as ARCHITECTURE_ANALYZER_VERSION } from '@/lib/architecture/types'
import { ANALYZER_VERSION as CONTENT_ANALYZER_VERSION } from '@/lib/content/types'
import { PERFORMANCE_ANALYZER_VERSION, ACCESSIBILITY_ANALYZER_VERSION, SECURITY_ANALYZER_VERSION } from '@/lib/pillars/types'

/**
 * Unified webioom engine, Prompt 3 — Overview's "Fix These First" section.
 * A small, deterministic aggregation over the SAME seven canonical
 * analyses Overview already reads (never a new scoring/prioritization
 * engine — explicitly out of scope per this pass's own instruction) using
 * only existing persisted severity/kind/affected-page-count evidence.
 *
 * Each canonical category has its OWN findings table (technical_findings,
 * architecture_findings, on_page_findings, content_findings, and the
 * shared pillar_findings for Performance/Accessibility/Security) — see
 * each migration's own header comment for why. Three of the five
 * (technical_findings/architecture_findings/on_page_findings) predate the
 * Problem-vs-Opportunity distinction and have no `finding_kind` column at
 * all — every row in those three is implicitly a scored problem. The other
 * two (content_findings/pillar_findings) DO have `finding_kind`, and only
 * `'problem'` rows are ever eligible here — an opportunity must never
 * appear in "Fix These First."
 */
export type Actionability = 'safe_fix' | 'prepared_fix' | 'guided_fix' | 'developer_required' | 'monitor'

export type TopProblem = {
  categoryKey: string
  categoryLabel: string
  href: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  affectedPageCount: number
  actionability: Actionability
}

const SEVERITY_RANK: Record<TopProblem['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 }
/**
 * PAYABLE-V1 PRODUCT COMPLETION: severity remains the PRIMARY sort key (a
 * critical problem a developer must fix is still more urgent to surface
 * than a low-severity one webioom can fix automatically), but this breaks
 * ties among same-severity findings so a passive "monitor" item can never
 * sit ahead of an equally-severe problem the customer can actually act on
 * right now — the exact "informational/manual-review findings dominating
 * urgent actionable problems" failure mode this section must avoid.
 */
const ACTIONABILITY_RANK: Record<Actionability, number> = {
  safe_fix: 0,
  prepared_fix: 0,
  guided_fix: 1,
  developer_required: 1,
  monitor: 2,
}
const MAX_TOP_PROBLEMS = 5

type RawRow = { title: string; severity: TopProblem['severity']; affected_page_count: number; actionability: Actionability; finding_kind?: string }

type CategoryRows = { categoryKey: string; categoryLabel: string; href: string; requiresProblemKind: boolean; rows: RawRow[] | null }

function toProblems(rows: RawRow[] | null, categoryKey: string, categoryLabel: string, href: string, requiresProblemKind: boolean): TopProblem[] {
  return (rows ?? [])
    .filter((row) => !requiresProblemKind || row.finding_kind === 'problem')
    .map((row) => ({
      categoryKey,
      categoryLabel,
      href,
      title: row.title,
      severity: row.severity,
      affectedPageCount: row.affected_page_count,
      actionability: row.actionability,
    }))
}

/**
 * Pure aggregation step, deliberately separated from the Supabase-fetching
 * wrapper below so it can be unit-tested directly (see
 * tests/fix-these-first.test.ts) without mocking a database client — the
 * same "pure builder consumes already-fetched rows" shape every other
 * canonical category's own summary builder already uses.
 */
export function buildFixTheseFirst(categories: CategoryRows[]): TopProblem[] {
  const allProblems = categories.flatMap((category) =>
    toProblems(category.rows, category.categoryKey, category.categoryLabel, category.href, category.requiresProblemKind)
  )

  return allProblems
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        ACTIONABILITY_RANK[a.actionability] - ACTIONABILITY_RANK[b.actionability] ||
        b.affectedPageCount - a.affectedPageCount
    )
    .slice(0, MAX_TOP_PROBLEMS)
}

export async function getFixTheseFirst(websiteId: string, crawlRunId: string): Promise<TopProblem[]> {
  const supabase = await createClient()

  const analyzerVersions = [
    TECHNICAL_SEO_ANALYZER_VERSION,
    ON_PAGE_ANALYZER_VERSION,
    ARCHITECTURE_ANALYZER_VERSION,
    CONTENT_ANALYZER_VERSION,
    PERFORMANCE_ANALYZER_VERSION,
    ACCESSIBILITY_ANALYZER_VERSION,
    SECURITY_ANALYZER_VERSION,
  ]

  const { data: analyses } = await supabase.from('crawl_analyses').select('id, analyzer_version').eq('crawl_run_id', crawlRunId).in('analyzer_version', analyzerVersions)

  const idFor = (version: string) => (analyses ?? []).find((row) => row.analyzer_version === version)?.id ?? null

  const technicalSeoId = idFor(TECHNICAL_SEO_ANALYZER_VERSION)
  const onPageId = idFor(ON_PAGE_ANALYZER_VERSION)
  const architectureId = idFor(ARCHITECTURE_ANALYZER_VERSION)
  const contentId = idFor(CONTENT_ANALYZER_VERSION)
  const performanceId = idFor(PERFORMANCE_ANALYZER_VERSION)
  const accessibilityId = idFor(ACCESSIBILITY_ANALYZER_VERSION)
  const securityId = idFor(SECURITY_ANALYZER_VERSION)

  const [technicalSeoRows, onPageRows, architectureRows, contentRows, performanceRows, accessibilityRows, securityRows] = await Promise.all([
    technicalSeoId
      ? supabase
          .from('technical_findings')
          .select('title, severity, affected_page_count, actionability')
          .eq('crawl_analysis_id', technicalSeoId)
          .then((r) => r.data as RawRow[] | null)
      : Promise.resolve(null),
    onPageId
      ? supabase
          .from('on_page_findings')
          .select('title, severity, affected_page_count, actionability')
          .eq('crawl_analysis_id', onPageId)
          .then((r) => r.data as RawRow[] | null)
      : Promise.resolve(null),
    architectureId
      ? supabase
          .from('architecture_findings')
          .select('title, severity, affected_page_count, actionability')
          .eq('crawl_analysis_id', architectureId)
          .then((r) => r.data as RawRow[] | null)
      : Promise.resolve(null),
    contentId
      ? supabase
          .from('content_findings')
          .select('title, severity, affected_page_count, actionability, finding_kind')
          .eq('crawl_analysis_id', contentId)
          .then((r) => r.data as RawRow[] | null)
      : Promise.resolve(null),
    performanceId
      ? supabase
          .from('pillar_findings')
          .select('title, severity, affected_page_count, actionability, finding_kind')
          .eq('crawl_analysis_id', performanceId)
          .eq('pillar', 'performance')
          .then((r) => r.data as RawRow[] | null)
      : Promise.resolve(null),
    accessibilityId
      ? supabase
          .from('pillar_findings')
          .select('title, severity, affected_page_count, actionability, finding_kind')
          .eq('crawl_analysis_id', accessibilityId)
          .eq('pillar', 'accessibility')
          .then((r) => r.data as RawRow[] | null)
      : Promise.resolve(null),
    securityId
      ? supabase
          .from('pillar_findings')
          .select('title, severity, affected_page_count, actionability, finding_kind')
          .eq('crawl_analysis_id', securityId)
          .eq('pillar', 'security')
          .then((r) => r.data as RawRow[] | null)
      : Promise.resolve(null),
  ])

  return buildFixTheseFirst([
    { categoryKey: 'technical_seo', categoryLabel: 'Technical SEO', href: `/dashboard/websites/${websiteId}/technical-seo`, requiresProblemKind: false, rows: technicalSeoRows },
    { categoryKey: 'on_page_seo', categoryLabel: 'On-Page SEO', href: `/dashboard/websites/${websiteId}/on-page-seo`, requiresProblemKind: false, rows: onPageRows },
    { categoryKey: 'site_architecture', categoryLabel: 'Site Architecture', href: `/dashboard/websites/${websiteId}/site-architecture`, requiresProblemKind: false, rows: architectureRows },
    { categoryKey: 'content', categoryLabel: 'Content', href: `/dashboard/websites/${websiteId}/content`, requiresProblemKind: true, rows: contentRows },
    { categoryKey: 'performance', categoryLabel: 'Performance', href: `/dashboard/websites/${websiteId}/performance`, requiresProblemKind: true, rows: performanceRows },
    { categoryKey: 'accessibility', categoryLabel: 'Accessibility', href: `/dashboard/websites/${websiteId}/accessibility`, requiresProblemKind: true, rows: accessibilityRows },
    { categoryKey: 'security', categoryLabel: 'Security', href: `/dashboard/websites/${websiteId}/security`, requiresProblemKind: true, rows: securityRows },
  ])
}
