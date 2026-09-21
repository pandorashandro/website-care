import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/content/types'
import type { FindingCategory, FindingScope, FindingKind, Confidence, Actionability, StateValue } from '@/lib/content/types'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import PillarSubNav from '@/components/website/pillar-sub-nav'
import { PILLAR_IDENTITY } from '@/components/website/pillar-identity'
import FindingList, { type NormalizedFinding } from '@/components/report/finding-list'
import { formatDate, SEVERITY_DISPLAY_ORDER, SEVERITY_LABELS, severityTone } from '@/components/report/report-helpers'
import ContentControls from './content-controls'
import { computeDimensionStatuses, type DimensionResult, type DimensionStatus } from '@/lib/content/dimensions'
import type { BadgeTone } from '@/components/ui/badge'

/**
 * Phase 29 — the Content Intelligence product surface, mirroring
 * app/dashboard/websites/[id]/on-page-seo/page.tsx's own solution-first
 * hierarchy: PROBLEM/OPPORTUNITY -> IMPACT/PRIORITY -> AFFECTED PAGES ->
 * EXACT EVIDENCE -> PROPOSED SOLUTION -> ACTION, preceded by
 * beginner-friendly summary metrics.
 *
 * Reads crawl_runs/crawl_analyses/content_findings/content_finding_pages
 * directly via the ordinary session-aware client — no admin client, no
 * write of any kind happens on this page. The Content Health score shown
 * here is `crawl_analyses.health_score` for THIS analyzer_version, read
 * verbatim — NEVER recomputed on this page — the exact same row Overview's
 * Category Health grid reads via getContentCategorySummary.
 *
 * PROBLEMS are shown separately from OPPORTUNITIES (this phase's own core
 * "health vs opportunity" distinction) — opportunities are never mixed into
 * the severity/score-relevant problem list, so a customer never mistakes an
 * optional suggestion for something actively wrong.
 */

type Website = { id: string; name: string; url: string }

type LatestCrawlRun = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
  pages_succeeded: number
  completed_at: string | null
}

type CoverageRecord = {
  eligiblePageCount: number
  highConfidenceExtractionCount: number
  lowConfidenceExtractionCount: number
  dimensionsAssessed: number
  dimensionsTotal: number
  percent: number
  level: 'high' | 'medium' | 'low'
} | null

type AnalysisRow = { id: string; health_score: number | null; completed_at: string | null; coverage: CoverageRecord }

type FindingRow = {
  id: string
  check_key: string
  category: FindingCategory
  scope: FindingScope
  finding_kind: FindingKind
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: Confidence
  title: string
  explanation: string
  why_it_matters: string
  recommendation: string
  affected_page_count: number
  occurrence_count: number
  unique_target_count: number
  actionability: Actionability
  evidence: Record<string, unknown>
}

type FindingInstanceRow = {
  finding_id: string
  url: string
  affected_resource_url: string | null
  current_state: StateValue | null
  desired_state: StateValue | null
  proposed_change: string | null
}

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  thinness: 'Content Depth',
  duplication: 'Duplication',
  structure: 'Structure',
  completeness: 'Completeness',
  faq: 'FAQ / Question Coverage',
  page_purpose: 'Page Purpose',
}

const DIMENSION_STATUS_LABELS: Record<DimensionStatus, string> = {
  healthy: 'Good',
  findings: 'Needs attention',
  opportunities: 'Opportunities',
  limited_confidence: 'Limited confidence',
  not_assessed: 'Not assessed',
}

const DIMENSION_STATUS_TONE: Record<DimensionStatus, BadgeTone> = {
  healthy: 'success',
  findings: 'danger',
  opportunities: 'info',
  limited_confidence: 'warning',
  not_assessed: 'neutral',
}

const ACTIONABILITY_LABELS: Record<Actionability, string> = {
  // Sprint 3, Prompt 2: never render the brand name inside an all-caps
  // badge (customer-facing spelling must stay "Webioom," never "WEBIOOM").
  safe_fix: 'SAFE FIX AVAILABLE',
  prepared_fix: 'SOLUTION READY FOR APPROVAL',
  guided_fix: 'GUIDED FIX',
  developer_required: 'DEVELOPER REQUIRED',
  monitor: 'MONITOR',
}

const ACTIONABILITY_TONE: Record<Actionability, 'success' | 'brand' | 'warning' | 'neutral' | 'info'> = {
  safe_fix: 'success',
  prepared_fix: 'brand',
  guided_fix: 'warning',
  developer_required: 'neutral',
  monitor: 'info',
}

const CONFIDENCE_LABELS: Record<Confidence, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }

const COVERAGE_LEVEL_LABELS: Record<'high' | 'medium' | 'low', string> = { high: 'High', medium: 'Medium', low: 'Limited' }
const COVERAGE_LEVEL_TONE: Record<'high' | 'medium' | 'low', BadgeTone> = { high: 'success', medium: 'warning', low: 'danger' }

/**
 * Phase 29 targeted completion pass — ANALYSIS COVERAGE, shown next to
 * Content Health so a high score can never visually imply a comprehensive
 * assessment when coverage is actually low (this phase's own explicit
 * instruction). SIMPLE VIEW is the badge itself (a business owner needs
 * only "High/Medium/Limited"); EXPERT VIEW is the line beneath it, with the
 * exact mechanics (pages with reliable extraction, dimensions genuinely
 * assessed out of 12) — the underlying evidence model is never simplified,
 * only its presentation depth changes. See lib/content/coverage.ts for the
 * documented formula this renders verbatim.
 */
function CoverageIndicator({ coverage }: { coverage: CoverageRecord }) {
  if (!coverage) return null

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Analysis Coverage</span>
        <Badge tone={COVERAGE_LEVEL_TONE[coverage.level]}>
          {COVERAGE_LEVEL_LABELS[coverage.level]} · {coverage.percent}%
        </Badge>
      </div>
      <p className="text-right text-xs text-muted sm:text-right">
        {coverage.highConfidenceExtractionCount} of {coverage.eligiblePageCount} pages with reliable extraction · {coverage.dimensionsAssessed} of{' '}
        {coverage.dimensionsTotal} dimensions genuinely assessed
      </p>
    </div>
  )
}

const MAX_INSTANCES_SHOWN = 8

function countsSummary(finding: FindingRow): string {
  const parts: string[] = []
  parts.push(`${finding.affected_page_count} page${finding.affected_page_count === 1 ? '' : 's'}`)

  if (finding.unique_target_count > 0) {
    parts.push(`${finding.unique_target_count} duplicate group${finding.unique_target_count === 1 ? '' : 's'}`)
  }

  return parts.join(' · ')
}

/**
 * Phase 29 — the 12 canonical Content Intelligence dimensions, rendered as
 * a compact, scannable status list rather than 12 separate large cards
 * (this phase's own "design a professional hierarchy" instruction). Every
 * dimension shows a real, honest status — 'not_assessed'/'limited_confidence'
 * are shown with the SAME visual prominence as any other status, never
 * silently hidden or dressed up as "Good" (this phase's own explicit "no
 * fake Good for unassessed dimension" instruction).
 */
function DimensionOverview({ dimensions }: { dimensions: DimensionResult[] }) {
  return (
    <Card padding="md">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Content Intelligence Overview</p>
      <ul className="mt-3 divide-y divide-border">
        {dimensions.map((dimension) => (
          <li key={dimension.key} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
            <div className="min-w-0 pr-4">
              <p className="text-sm font-medium text-gray-900">{dimension.label}</p>
              <p className="mt-0.5 text-xs text-muted">{dimension.summary}</p>
            </div>
            <Badge tone={DIMENSION_STATUS_TONE[dimension.status]}>{DIMENSION_STATUS_LABELS[dimension.status]}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function InstanceRow({ instance }: { instance: FindingInstanceRow }) {
  return (
    <li className="rounded-md border border-border bg-surface p-3 text-xs">
      <p className="truncate font-medium text-gray-900">{instance.url}</p>
      {instance.current_state && (
        <p className="mt-1 text-muted">
          <span className="font-medium">{instance.current_state.label}:</span> {instance.current_state.value ?? '—'}
        </p>
      )}
      {instance.desired_state && (
        <p className="mt-1 text-muted">
          <span className="font-medium">{instance.desired_state.label}:</span> {instance.desired_state.value ?? '—'}
        </p>
      )}
      {instance.proposed_change && <p className="mt-1.5 font-medium text-gray-900">→ {instance.proposed_change}</p>}
    </li>
  )
}

/** Sprint 3, Prompt 2B — maps this page's own FindingRow/FindingInstanceRow shape into the shared FindingList's NormalizedFinding, exactly like technical-seo/page.tsx does — no change to what's queried or how it's classified. */
function toNormalizedFinding(finding: FindingRow, instances: FindingInstanceRow[]): NormalizedFinding {
  const shownInstances = instances.slice(0, MAX_INSTANCES_SHOWN)
  const remainingCount = instances.length - shownInstances.length

  return {
    id: finding.id,
    categoryLabel: CATEGORY_LABELS[finding.category],
    title: finding.title,
    severity: finding.severity,
    actionabilityLabel: ACTIONABILITY_LABELS[finding.actionability],
    actionabilityTone: ACTIONABILITY_TONE[finding.actionability],
    whyItMatters: finding.why_it_matters,
    recommendation: finding.recommendation,
    confidenceLabel: CONFIDENCE_LABELS[finding.confidence],
    countsSummary: countsSummary(finding),
    evidence:
      shownInstances.length > 0 ? (
        <>
          <ul className="space-y-2">
            {shownInstances.map((instance, index) => (
              <InstanceRow key={`${instance.url}-${instance.affected_resource_url ?? index}`} instance={instance} />
            ))}
          </ul>
          {remainingCount > 0 && <p className="mt-2 text-xs text-muted">+{remainingCount} more page{remainingCount === 1 ? '' : 's'}</p>}
        </>
      ) : undefined,
  }
}

export default async function ContentPage(props: PageProps<'/dashboard/websites/[id]/content'>) {
  const { id } = await props.params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, name, url')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
    .returns<Website>()

  if (websiteError || !website) {
    notFound()
  }

  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, status, pages_succeeded, completed_at')
    .eq('website_id', website.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<LatestCrawlRun>()

  const isAnalyzableCrawl = crawlRun?.status === 'completed' || crawlRun?.status === 'partial'

  let analysis: AnalysisRow | null = null
  let findings: FindingRow[] = []
  let instancesByFinding = new Map<string, FindingInstanceRow[]>()

  if (crawlRun && isAnalyzableCrawl) {
    const { data: analysisRow } = await supabase
      .from('crawl_analyses')
      .select('id, health_score, completed_at, coverage')
      .eq('crawl_run_id', crawlRun.id)
      .eq('analyzer_version', ANALYZER_VERSION)
      .maybeSingle()
      .returns<AnalysisRow>()

    analysis = analysisRow ?? null

    if (analysis) {
      const { data: findingRows } = await supabase
        .from('content_findings')
        .select(
          'id, check_key, category, scope, finding_kind, severity, confidence, title, explanation, why_it_matters, recommendation, affected_page_count, occurrence_count, unique_target_count, actionability, evidence'
        )
        .eq('crawl_analysis_id', analysis.id)
        .returns<FindingRow[]>()

      findings = findingRows ?? []

      if (findings.length > 0) {
        const { data: instanceRows } = await supabase
          .from('content_finding_pages')
          .select('finding_id, url, affected_resource_url, current_state, desired_state, proposed_change')
          .in(
            'finding_id',
            findings.map((f) => f.id)
          )
          .returns<FindingInstanceRow[]>()

        const grouped = new Map<string, FindingInstanceRow[]>()
        for (const row of instanceRows ?? []) {
          const list = grouped.get(row.finding_id) ?? []
          list.push(row)
          grouped.set(row.finding_id, list)
        }
        instancesByFinding = grouped
      }
    }
  }

  const healthScore = analysis?.health_score ?? null

  // page_purpose_summary is purely informational (see
  // lib/content/dimensions.ts) — it is already represented in the
  // dimension overview grid below with its own status/summary, so it is
  // excluded here to avoid duplicating the same information as a generic
  // "opportunity" card.
  const reportableFindings = findings.filter((f) => f.check_key !== 'page_purpose_summary')
  const problems = reportableFindings.filter((f) => f.finding_kind === 'problem')
  const opportunities = reportableFindings.filter((f) => f.finding_kind === 'opportunity')

  const severityCounts: Record<string, number> = {}
  for (const finding of problems) {
    severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1
  }

  const sortedProblems = [...problems].sort((a, b) => SEVERITY_DISPLAY_ORDER.indexOf(a.severity) - SEVERITY_DISPLAY_ORDER.indexOf(b.severity))

  const dimensions = computeDimensionStatuses({
    findings: findings.map((f) => ({ checkKey: f.check_key, kind: f.finding_kind, evidence: f.evidence })),
    eligiblePageCount: 0,
  })

  return (
    <Container size="2xl" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <Card padding="none" className="mt-4 overflow-hidden">
        <div className="h-1 w-full" style={{ backgroundColor: PILLAR_IDENTITY.content.accent }} aria-hidden="true" />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
            <FileText className="h-3.5 w-3.5" style={{ color: PILLAR_IDENTITY.content.accent }} aria-hidden="true" />
            Content
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Content Intelligence</h1>
          <p className="mt-1 text-sm text-muted">Whether each page has useful, sufficiently complete, and differentiated content for its apparent purpose.</p>

          {analysis && (
            <p className="mt-2 text-sm text-muted">Last analyzed {analysis.completed_at ? formatDate(analysis.completed_at) : 'recently'}</p>
          )}
        </div>

        {crawlRun && isAnalyzableCrawl && (
          <div className="sm:w-56 sm:shrink-0">
            <ContentControls websiteId={website.id} crawlRunId={crawlRun.id} hasExistingAnalysis={!!analysis} />
          </div>
        )}
        </div>
      </Card>

      <WebsiteSubNav websiteId={website.id} active="content" />
      <PillarSubNav websiteId={website.id} active="content" />

      {!crawlRun ? (
        <EmptyState
          icon={FileText}
          title="Scan your website first."
          description="Content Intelligence is built from your website scan. Run a scan from the Overview page, then come back here to see what webioom found."
          action={
            <Link href={`/dashboard/websites/${website.id}`} className={buttonStyles({ variant: 'outline' })}>
              Go to Overview
            </Link>
          }
          className="mt-6"
        />
      ) : !isAnalyzableCrawl ? (
        <Alert tone="info" className="mt-6">
          Your site scan is still {crawlRun.status === 'queued' || crawlRun.status === 'running' ? 'in progress' : 'not usable for analysis'}. Come back once it
          finishes.
        </Alert>
      ) : crawlRun.status === 'partial' ? (
        <Alert tone="info" className="mt-6">
          This analysis covers only the {crawlRun.pages_succeeded} page{crawlRun.pages_succeeded === 1 ? '' : 's'} webioom crawled before reaching your
          plan&apos;s page limit — not necessarily your entire site. Duplicate/repetition findings below describe only what was observed among the pages
          analyzed, not a claim about your entire site.
        </Alert>
      ) : null}

      {crawlRun && isAnalyzableCrawl && !analysis && (
        <EmptyState
          title="This crawl hasn't been analyzed yet."
          description="Run analysis to turn your crawl evidence into a Content diagnosis."
          className="mt-6"
        />
      )}

      {analysis && crawlRun && (
        <div className="mt-6 space-y-6">
          <Card padding="md">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Content Health</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{healthScore ?? '—'}</p>
                {analysis?.coverage && analysis.coverage.level === 'low' && (
                  <p className="mt-1 text-xs font-medium text-amber-700">Limited analysis — see coverage below before treating this score as comprehensive.</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex flex-wrap justify-end gap-2">
                  {SEVERITY_DISPLAY_ORDER.filter((severity) => severityCounts[severity] > 0).map((severity) => (
                    <Badge key={severity} tone={severityTone(severity)}>
                      {severityCounts[severity]} {SEVERITY_LABELS[severity]}
                    </Badge>
                  ))}
                </div>
                <CoverageIndicator coverage={analysis?.coverage ?? null} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-4">
              <SummaryMetric label="Pages analyzed" value={crawlRun.pages_succeeded} />
              <SummaryMetric label="Content problems" value={problems.length} />
              <SummaryMetric label="Content opportunities" value={opportunities.length} />
            </div>
          </Card>

          <DimensionOverview dimensions={dimensions} />

          {problems.length === 0 ? (
            <EmptyState title="No content problems found" description="webioom didn't detect any of the content conditions it currently checks for." />
          ) : (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Biggest content problems</h2>
              <FindingList findings={sortedProblems.map((finding) => toNormalizedFinding(finding, instancesByFinding.get(finding.id) ?? []))} />
            </div>
          )}

          {opportunities.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Content opportunities</h2>
                <p className="mt-1 text-sm text-muted">Suggestions for already-adequate content — these do not affect your Content Health score.</p>
              </div>
              <FindingList findings={opportunities.map((finding) => toNormalizedFinding(finding, instancesByFinding.get(finding.id) ?? []))} />
            </div>
          )}
        </div>
      )}
    </Container>
  )
}
