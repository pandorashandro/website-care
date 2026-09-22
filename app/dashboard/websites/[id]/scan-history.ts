import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
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
import { computeOverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import type { CategorySummary } from '@/lib/category-engine/types'
import { computeFindingFingerprint } from '@/lib/monitoring/fingerprint'
import { CANONICAL_PILLARS, type CanonicalSnapshot, type CanonicalPillar, type PillarSnapshot, type SnapshotFinding, type Severity } from '@/lib/monitoring/types'
import { buildChangeSummary, type ChangeSummary } from '@/lib/monitoring/compare'

/**
 * Sprint 2, Prompt 1 — MONITORING FOUNDATION. The ONE place canonical
 * historical snapshots and their comparisons are ever fetched — never a
 * second scoring system, never a duplicated finding table. Every score
 * comes from the SAME persisted `crawl_analyses.health_score` rows and the
 * SAME category-summary builder functions Overview and every dedicated
 * pillar page already use (buildTechnicalSeoCategorySummary et al.) — this
 * module only adds the ability to resolve them for an EXPLICIT, historical
 * crawl_run_id instead of always "the latest," plus the finding-level
 * fetch/fingerprint/compare machinery that didn't exist before.
 *
 * A CanonicalSnapshot is immutable once built: every field comes from rows
 * tied to one specific, already-completed crawl_run_id, and this codebase
 * already never overwrites or deletes a past crawl_run/crawl_analyses/
 * finding row (see lib/crawler/engine.ts's startCrawlRun — a new scan
 * always creates a brand-new crawl_run when no crawl is currently active,
 * never reuses or mutates a terminal one). No new duplication table is
 * needed for historical correctness; this module simply reads the
 * already-versioned-by-construction rows for whichever crawl_run_id it is
 * asked about.
 */

const PILLAR_ANALYZER_VERSIONS: Record<CanonicalPillar, string> = {
  technical_seo: TECHNICAL_SEO_ANALYZER_VERSION,
  on_page_seo: ON_PAGE_ANALYZER_VERSION,
  content: CONTENT_ANALYZER_VERSION,
  site_architecture: ARCHITECTURE_ANALYZER_VERSION,
  performance: PERFORMANCE_ANALYZER_VERSION,
  accessibility: ACCESSIBILITY_ANALYZER_VERSION,
  security: SECURITY_ANALYZER_VERSION,
}

type FindingTableConfig = {
  table: string
  instanceTable: string
  requiresProblemKind: boolean
  /** Only set for the shared pillar_findings/pillar_finding_pages tables, which hold all three newer pillars and must be filtered by their own `pillar` column. */
  pillarColumnValue?: string
}

const PILLAR_TABLE_CONFIG: Record<CanonicalPillar, FindingTableConfig> = {
  technical_seo: { table: 'technical_findings', instanceTable: 'technical_finding_pages', requiresProblemKind: false },
  on_page_seo: { table: 'on_page_findings', instanceTable: 'on_page_finding_pages', requiresProblemKind: false },
  site_architecture: { table: 'architecture_findings', instanceTable: 'architecture_finding_pages', requiresProblemKind: false },
  content: { table: 'content_findings', instanceTable: 'content_finding_pages', requiresProblemKind: true },
  performance: { table: 'pillar_findings', instanceTable: 'pillar_finding_pages', requiresProblemKind: true, pillarColumnValue: 'performance' },
  accessibility: { table: 'pillar_findings', instanceTable: 'pillar_finding_pages', requiresProblemKind: true, pillarColumnValue: 'accessibility' },
  security: { table: 'pillar_findings', instanceTable: 'pillar_finding_pages', requiresProblemKind: true, pillarColumnValue: 'security' },
}

export type ScanListItem = { crawlRunId: string; status: string; completedAt: string | null; isPartial: boolean }

/**
 * The trusted core query, shared by every caller that has already
 * established which website it is entitled to read — takes a plain
 * `websiteId` and whichever Supabase client already carries the right
 * authority for that caller (the ordinary session client for the
 * customer-facing UI below, or the service-role admin client for Sprint 2
 * Prompt 2's scheduled-monitoring pipeline — see
 * lib/monitoring/monitoring-run.ts, which is a trusted server-only caller
 * that has already resolved the correct website_id itself via its own
 * due-work claim query, not from arbitrary user input). Performs NO
 * ownership check of its own, by design — exactly like
 * lib/crawler/supabase-store.ts's own documented pattern — so every caller
 * of this function must independently justify, in its own code, how it
 * already knows this websiteId is the one it is authorized to read.
 */
export async function listCompletedScansForWebsite(supabase: SupabaseClient, websiteId: string, limit = 20): Promise<ScanListItem[]> {
  const { data } = await supabase
    .from('crawl_runs')
    .select('id, status, completed_at')
    .eq('website_id', websiteId)
    .in('status', ['completed', 'partial'])
    .order('completed_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => ({ crawlRunId: row.id, status: row.status, completedAt: row.completed_at, isPartial: row.status === 'partial' }))
}

/**
 * Ownership-verified, most-recent-first list of this website's own
 * completed/partial crawl runs — the raw material for the History surface
 * and for picking the current/previous comparison pair. Re-authenticates
 * and re-verifies website ownership itself; never trusts a caller's own
 * earlier check.
 */
export async function listCompletedScans(websiteId: string, limit = 20): Promise<ScanListItem[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: website } = await supabase.from('websites').select('id').eq('id', websiteId).eq('user_id', user.id).maybeSingle()
  if (!website) return []

  return listCompletedScansForWebsite(supabase, website.id, limit)
}

/**
 * Pure — given an already-fetched, most-recent-first list of completed
 * scans, decides which pair (if any) is the current/previous comparison
 * pair. Separated from listCompletedScans so this decision is unit
 * testable without Supabase (mirrors fix-these-first.ts's own
 * buildFixTheseFirst/getFixTheseFirst split).
 */
export function selectComparisonPair(scans: ScanListItem[]): { current: ScanListItem; previous: ScanListItem | null } | null {
  if (scans.length === 0) return null
  return { current: scans[0], previous: scans[1] ?? null }
}

type FindingRow = {
  id: string
  check_key: string
  scope: 'page' | 'site'
  severity: Severity
  actionability: string
  title: string
  finding_kind?: string
}

type InstanceRow = { finding_id: string; url: string; affected_resource_url: string | null }

async function fetchPillarSnapshot(
  supabase: SupabaseClient,
  pillar: CanonicalPillar,
  crawlRunId: string,
  crawlRunForSummary: { id: string; status: string },
  contributingSummaries: CategorySummary[]
): Promise<PillarSnapshot> {
  const analyzerVersion = PILLAR_ANALYZER_VERSIONS[pillar]
  const { data: analysisRow } = await supabase
    .from('crawl_analyses')
    .select('id, health_score, findings_count, completed_at, analyzer_version, coverage')
    .eq('crawl_run_id', crawlRunId)
    .eq('analyzer_version', analyzerVersion)
    .maybeSingle()

  const summary = buildCategorySummaryFor(pillar, crawlRunForSummary, analysisRow)
  contributingSummaries.push(summary)

  if (summary.status !== 'analyzed' || !analysisRow) {
    return { pillar, coverage: 'not_analyzed', healthScore: null, findings: [] }
  }

  // Evidence-aware health scoring (2026-09-22) — a real, persisted analysis
  // exists, but the coverage it was built from is thin (e.g. only 1
  // eligible page). See PillarCoverage's own doc comment (lib/monitoring/types.ts)
  // for why this is kept OUT of monitoring comparisons even though the
  // score itself is real and still shown in-app.
  const monitoringCoverage: 'analyzed' | 'insufficient_data' = summary.coverage === 'low' ? 'insufficient_data' : 'analyzed'

  const config = PILLAR_TABLE_CONFIG[pillar]
  // Two literal select strings (never a runtime-concatenated one) so
  // Supabase's own type inference can resolve each shape correctly rather
  // than falling back to an untyped GenericStringError result.
  const findingSelect = config.requiresProblemKind ? 'id, check_key, scope, severity, actionability, title, finding_kind' : 'id, check_key, scope, severity, actionability, title'
  let findingQuery = supabase.from(config.table).select(findingSelect).eq('crawl_analysis_id', analysisRow.id)
  if (config.pillarColumnValue) findingQuery = findingQuery.eq('pillar', config.pillarColumnValue)

  const { data: findingRows } = await findingQuery
  const findings = ((findingRows ?? []) as unknown as FindingRow[]).filter((row) => !config.requiresProblemKind || row.finding_kind === 'problem')

  if (findings.length === 0) {
    return { pillar, coverage: monitoringCoverage, healthScore: summary.score, findings: [] }
  }

  const { data: instanceRows } = await supabase
    .from(config.instanceTable)
    .select('finding_id, url, affected_resource_url')
    .in(
      'finding_id',
      findings.map((f) => f.id)
    )

  const instancesByFinding = new Map<string, InstanceRow[]>()
  for (const row of (instanceRows ?? []) as InstanceRow[]) {
    const list = instancesByFinding.get(row.finding_id) ?? []
    list.push(row)
    instancesByFinding.set(row.finding_id, list)
  }

  const snapshotFindings: SnapshotFinding[] = findings.flatMap((finding): SnapshotFinding[] => {
    if (finding.scope === 'site') {
      return [
        {
          fingerprint: computeFindingFingerprint({ pillar, checkKey: finding.check_key, scope: 'site' }),
          pillar,
          checkKey: finding.check_key,
          scope: 'site',
          title: finding.title,
          severity: finding.severity,
          actionability: finding.actionability as SnapshotFinding['actionability'],
          instance: null,
        },
      ]
    }

    const instances = instancesByFinding.get(finding.id) ?? []
    return instances.map((instance): SnapshotFinding => ({
      fingerprint: computeFindingFingerprint({
        pillar,
        checkKey: finding.check_key,
        scope: 'page',
        instance: { url: instance.url, affectedResourceUrl: instance.affected_resource_url },
      }),
      pillar,
      checkKey: finding.check_key,
      scope: 'page',
      title: finding.title,
      severity: finding.severity,
      actionability: finding.actionability as SnapshotFinding['actionability'],
      instance: { url: instance.url, affectedResourceUrl: instance.affected_resource_url },
    }))
  })

  return { pillar, coverage: monitoringCoverage, healthScore: summary.score, findings: snapshotFindings }
}

function buildCategorySummaryFor(
  pillar: CanonicalPillar,
  crawlRun: { id: string; status: string } | null,
  // Deliberately NOT declaring `coverage` here: each pillar persists a
  // DIFFERENT coverage shape (OnPageAnalysisCoverage/TechnicalSeoCoverage/
  // ArchitectureCoverage/ContentAnalysisCoverage/PillarCoverage — all
  // different types), so there is no single shape to name here. The actual
  // runtime object (from the query below, which DOES select `coverage`)
  // still carries the field through untouched — TypeScript's excess-
  // property checking only applies to object LITERALS, never to a value
  // passed through a variable, so each buildXCategorySummary below still
  // receives and correctly reads its own `analysis.coverage` field.
  analysis: { health_score: number | null; findings_count: number; completed_at: string | null; analyzer_version: string } | null
): CategorySummary {
  switch (pillar) {
    case 'technical_seo':
      return buildTechnicalSeoCategorySummary(crawlRun, analysis)
    case 'on_page_seo':
      return buildOnPageCategorySummary(crawlRun, analysis)
    case 'site_architecture':
      return buildSiteArchitectureCategorySummary(crawlRun, analysis)
    case 'content':
      return buildContentCategorySummary(crawlRun, analysis)
    case 'performance':
      return buildPillarCategorySummary('performance', crawlRun, analysis)
    case 'accessibility':
      return buildPillarCategorySummary('accessibility', crawlRun, analysis)
    case 'security':
      return buildPillarCategorySummary('security', crawlRun, analysis)
  }
}

/**
 * The trusted core snapshot-builder, shared the same way
 * listCompletedScansForWebsite is — see that function's own doc comment for
 * exactly which callers may use this and why. Still independently confirms
 * the requested crawl_run_id actually belongs to `websiteId` (never trusts
 * a crawl_run_id alone), even though it trusts `websiteId` itself from its
 * caller.
 */
export async function getCanonicalSnapshotForWebsite(supabase: SupabaseClient, websiteId: string, crawlRunId: string): Promise<CanonicalSnapshot | null> {
  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, website_id, status, completed_at')
    .eq('id', crawlRunId)
    .eq('website_id', websiteId)
    .maybeSingle()
  if (!crawlRun) return null

  const crawlRunForSummary = { id: crawlRun.id, status: crawlRun.status }
  const contributingSummaries: CategorySummary[] = []

  const pillars = {} as Record<CanonicalPillar, PillarSnapshot>
  for (const pillar of CANONICAL_PILLARS) {
    pillars[pillar] = await fetchPillarSnapshot(supabase, pillar, crawlRun.id, crawlRunForSummary, contributingSummaries)
  }

  const overallHealth = computeOverallWebsiteHealth(contributingSummaries)

  const { data: analyzedPages } = await supabase.from('crawl_pages').select('url').eq('crawl_run_id', crawlRun.id).eq('status', 'completed')

  return {
    crawlRunId: crawlRun.id,
    websiteId,
    completedAt: crawlRun.completed_at,
    isPartialCrawl: crawlRun.status === 'partial',
    overallHealth,
    pillars,
    analyzedPageUrls: new Set((analyzedPages ?? []).map((p) => p.url)),
  }
}

/**
 * The ONE place a full, immutable historical snapshot is assembled for a
 * specific crawl_run_id — re-verifies session + website ownership + that
 * the crawl_run actually belongs to this website, exactly like every other
 * trusted resolver in this codebase. Returns null for anything that fails
 * ownership or does not exist, never a partial/guessed result.
 */
export async function getCanonicalSnapshot(websiteId: string, crawlRunId: string): Promise<CanonicalSnapshot | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: website } = await supabase.from('websites').select('id').eq('id', websiteId).eq('user_id', user.id).maybeSingle()
  if (!website) return null

  return getCanonicalSnapshotForWebsite(supabase, website.id, crawlRunId)
}

export type ScanHistoryEntry = {
  crawlRunId: string
  completedAt: string | null
  isPartial: boolean
  overallHealthScore: number | null
  pillarScores: Record<CanonicalPillar, number | null>
}

/**
 * Step 10 — the minimal History surface's own data: for each of this
 * website's own most-recent completed/partial scans, its Overall Health and
 * 7 pillar scores at that point in time. Deliberately small (`limit`
 * defaults to 10, never unbounded) — this is a compact timeline, not a
 * general-purpose analytics dashboard. Each entry is built from
 * getCanonicalSnapshot, so it can never disagree with what "Since Last
 * Scan" or a dedicated pillar page would show for that same crawl_run_id.
 */
export async function listScanHistoryWithHealth(websiteId: string, limit = 10): Promise<ScanHistoryEntry[]> {
  const scans = await listCompletedScans(websiteId, limit)

  const snapshots = await Promise.all(scans.map((scan) => getCanonicalSnapshot(websiteId, scan.crawlRunId)))

  return scans.map((scan, index) => {
    const snapshot = snapshots[index]
    const pillarScores = {} as Record<CanonicalPillar, number | null>
    for (const pillar of CANONICAL_PILLARS) {
      pillarScores[pillar] = snapshot?.pillars[pillar]?.healthScore ?? null
    }

    return {
      crawlRunId: scan.crawlRunId,
      completedAt: scan.completedAt,
      isPartial: scan.isPartial,
      overallHealthScore: snapshot?.overallHealth.score ?? null,
      pillarScores,
    }
  })
}

/**
 * A tagged result rather than a plain nullable ChangeSummary, so the UI
 * (Overview's "Since last scan" card) is never left to guess WHY there is
 * no comparison — "never scanned," "only one scan so far" (honest baseline
 * message, never a fabricated comparison), and "compared" are three
 * genuinely different customer-facing states.
 */
export type LatestChangeResult =
  | { status: 'no_scans' }
  | { status: 'baseline_only'; scan: ScanListItem }
  | { status: 'compared'; summary: ChangeSummary }

/**
 * The single entry point Overview's "Since last scan" card and the History
 * page both call.
 */
export async function getLatestChangeSummary(websiteId: string): Promise<LatestChangeResult> {
  const scans = await listCompletedScans(websiteId, 2)
  const pair = selectComparisonPair(scans)
  if (!pair) return { status: 'no_scans' }
  if (!pair.previous) return { status: 'baseline_only', scan: pair.current }

  const [current, previous] = await Promise.all([
    getCanonicalSnapshot(websiteId, pair.current.crawlRunId),
    getCanonicalSnapshot(websiteId, pair.previous.crawlRunId),
  ])
  if (!current || !previous) return { status: 'no_scans' }

  return { status: 'compared', summary: buildChangeSummary(previous, current) }
}
