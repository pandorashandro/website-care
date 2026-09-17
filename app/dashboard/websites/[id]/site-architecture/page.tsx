import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Network } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/architecture/types'
import type { FindingCategory, FindingScope, Confidence, Actionability, StateValue } from '@/lib/architecture/types'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import { formatDate, SEVERITY_DISPLAY_ORDER, SEVERITY_LABELS, severityTone } from '@/components/report/report-helpers'
import SiteArchitectureControls from './site-architecture-controls'

/**
 * Phase 27 — the Site Architecture product surface, mirroring
 * app/dashboard/websites/[id]/technical-seo/page.tsx's own solution-first
 * hierarchy exactly, adapted for graph-based evidence: PROBLEM -> IMPACT/
 * PRIORITY -> AFFECTED ASSETS -> EXACT EVIDENCE -> PROPOSED SOLUTION ->
 * ACTION, preceded by beginner-friendly summary metrics (Section J).
 *
 * Reads crawl_runs/crawl_analyses/architecture_findings/
 * architecture_finding_pages directly via the ordinary session-aware
 * client — no admin client, no write of any kind happens on this page. The
 * Site Architecture health score shown here is `crawl_analyses.health_score`
 * for THIS analyzer_version, read verbatim — NEVER recomputed on this page
 * — the exact same row Overview's Category Health grid reads via
 * getSiteArchitectureCategorySummary (see
 * app/dashboard/websites/[id]/site-architecture-summary.ts).
 */

type Website = { id: string; name: string; url: string }

type LatestCrawlRun = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
  pages_succeeded: number
  completed_at: string | null
}

type AnalysisRow = { id: string; health_score: number | null; completed_at: string | null }

type FindingRow = {
  id: string
  check_key: string
  category: FindingCategory
  scope: FindingScope
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
  orphan_pages: 'Orphan Pages',
  link_depth: 'Link Depth',
  internal_link_health: 'Internal Link Health',
  link_distribution: 'Link Distribution',
  dead_ends: 'Dead Ends',
  link_opportunities: 'Link Opportunities',
  site_wide_consistency: 'Site-Wide Patterns',
}

const ACTIONABILITY_LABELS: Record<Actionability, string> = {
  safe_fix: 'WEBIOOM CAN FIX',
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

const MAX_INSTANCES_SHOWN = 8

function countsSummary(finding: FindingRow): string {
  const parts: string[] = []
  parts.push(`${finding.affected_page_count} page${finding.affected_page_count === 1 ? '' : 's'}`)

  if (finding.unique_target_count > 0) {
    parts.push(`${finding.unique_target_count} unique target${finding.unique_target_count === 1 ? '' : 's'}`)
  }
  if (finding.occurrence_count !== finding.affected_page_count) {
    parts.push(`${finding.occurrence_count} occurrence${finding.occurrence_count === 1 ? '' : 's'}`)
  }

  return parts.join(' · ')
}

function findingCountByKey(findings: FindingRow[], checkKey: string): number {
  return findings.find((f) => f.check_key === checkKey)?.affected_page_count ?? 0
}

function occurrenceCountByKey(findings: FindingRow[], checkKey: string): number {
  return findings.find((f) => f.check_key === checkKey)?.occurrence_count ?? 0
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
      {instance.affected_resource_url && instance.affected_resource_url !== instance.url && (
        <p className="mt-1 truncate text-muted">
          <span className="font-medium">Affected resource:</span> {instance.affected_resource_url}
        </p>
      )}
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

export default async function SiteArchitecturePage(props: PageProps<'/dashboard/websites/[id]/site-architecture'>) {
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
  let internalLinkCount = 0

  if (crawlRun && isAnalyzableCrawl) {
    const [{ data: analysisRow }, { count: linkCount }] = await Promise.all([
      supabase
        .from('crawl_analyses')
        .select('id, health_score, completed_at')
        .eq('crawl_run_id', crawlRun.id)
        .eq('analyzer_version', ANALYZER_VERSION)
        .maybeSingle()
        .returns<AnalysisRow>(),
      supabase.from('crawl_links').select('id', { count: 'exact', head: true }).eq('crawl_run_id', crawlRun.id).eq('link_type', 'internal'),
    ])

    analysis = analysisRow ?? null
    internalLinkCount = linkCount ?? 0

    if (analysis) {
      const { data: findingRows } = await supabase
        .from('architecture_findings')
        .select(
          'id, check_key, category, scope, severity, confidence, title, explanation, why_it_matters, recommendation, affected_page_count, occurrence_count, unique_target_count, actionability'
        )
        .eq('crawl_analysis_id', analysis.id)
        .returns<FindingRow[]>()

      findings = findingRows ?? []

      if (findings.length > 0) {
        const { data: instanceRows } = await supabase
          .from('architecture_finding_pages')
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

  // The score is read verbatim from the persisted analysis row — NEVER
  // recomputed on this page.
  const healthScore = analysis?.health_score ?? null

  const severityCounts: Record<string, number> = {}
  for (const finding of findings) {
    severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1
  }

  const sortedFindings = [...findings].sort((a, b) => SEVERITY_DISPLAY_ORDER.indexOf(a.severity) - SEVERITY_DISPLAY_ORDER.indexOf(b.severity))

  return (
    <Container size="md" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <Card padding="md" className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Site Architecture</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Site Architecture &amp; Internal Linking</h1>
          <p className="mt-1 text-sm text-muted">How easily pages on your website can be discovered and reached through your internal links.</p>

          {analysis && (
            <p className="mt-2 text-sm text-muted">Last analyzed {analysis.completed_at ? formatDate(analysis.completed_at) : 'recently'}</p>
          )}
        </div>

        {crawlRun && isAnalyzableCrawl && (
          <div className="sm:w-56 sm:shrink-0">
            <SiteArchitectureControls websiteId={website.id} crawlRunId={crawlRun.id} hasExistingAnalysis={!!analysis} />
          </div>
        )}
      </Card>

      <WebsiteSubNav websiteId={website.id} active="site-architecture" />

      {!crawlRun ? (
        <EmptyState
          icon={Network}
          title="Run a site scan first."
          description="Site Architecture analysis is built from a site-wide crawl. Start a site scan, then come back here to analyze what webioom found."
          action={
            <Link href={`/dashboard/websites/${website.id}/site-scan`} className={buttonStyles({ variant: 'outline' })}>
              Go to Site Scan
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
          plan&apos;s page limit — not your entire site. Because missing pages could hide real internal links, orphan-page and underlinked-page findings
          are not shown for a partial crawl; they will appear once a complete crawl is analyzed.
        </Alert>
      ) : null}

      {crawlRun && isAnalyzableCrawl && !analysis && (
        <EmptyState
          title="This crawl hasn't been analyzed yet."
          description="Run analysis to turn your crawl evidence into a Site Architecture diagnosis."
          className="mt-6"
        />
      )}

      {analysis && crawlRun && (
        <div className="mt-6 space-y-6">
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Site Architecture Health</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{healthScore ?? '—'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SEVERITY_DISPLAY_ORDER.filter((severity) => severityCounts[severity] > 0).map((severity) => (
                  <Badge key={severity} tone={severityTone(severity)}>
                    {severityCounts[severity]} {SEVERITY_LABELS[severity]}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryMetric label="Pages analyzed" value={crawlRun.pages_succeeded} />
              <SummaryMetric label="Internal links analyzed" value={internalLinkCount} />
              <SummaryMetric label="Orphan pages" value={findingCountByKey(findings, 'orphan_page')} />
              <SummaryMetric label="Deep pages" value={findingCountByKey(findings, 'deep_page')} />
              <SummaryMetric label="Broken internal links" value={occurrenceCountByKey(findings, 'internal_link_to_broken_edge')} />
              <SummaryMetric label="Redirected internal links" value={occurrenceCountByKey(findings, 'internal_link_to_redirect_edge')} />
            </div>
          </Card>

          {findings.length === 0 ? (
            <EmptyState title="No architecture problems found" description="webioom didn't detect any of the site-architecture conditions it currently checks for." />
          ) : (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Biggest architecture opportunities</h2>
              {sortedFindings.map((finding) => {
                const instances = instancesByFinding.get(finding.id) ?? []
                const shownInstances = instances.slice(0, MAX_INSTANCES_SHOWN)
                const remainingCount = instances.length - shownInstances.length

                return (
                  <Card key={finding.id} padding="md">
                    {/* PROBLEM */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{CATEGORY_LABELS[finding.category]}</p>
                        <h3 className="mt-1 text-base font-semibold text-gray-900">{finding.title}</h3>
                      </div>
                      {/* IMPACT/PRIORITY */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={severityTone(finding.severity)}>{SEVERITY_LABELS[finding.severity]}</Badge>
                        <Badge tone="neutral">{CONFIDENCE_LABELS[finding.confidence]}</Badge>
                      </div>
                    </div>

                    {/* AFFECTED ASSETS */}
                    <p className="mt-2 text-xs font-medium text-muted">{countsSummary(finding)}</p>

                    {/* ACTIONABILITY — only ever a label, never a button unless backend truth supports it (none does yet in this phase) */}
                    <div className="mt-2">
                      <Badge tone={ACTIONABILITY_TONE[finding.actionability]}>{ACTIONABILITY_LABELS[finding.actionability]}</Badge>
                    </div>

                    {/* EXACT EVIDENCE */}
                    {shownInstances.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {shownInstances.map((instance, index) => (
                          <InstanceRow key={`${instance.url}-${instance.affected_resource_url ?? index}`} instance={instance} />
                        ))}
                      </ul>
                    )}
                    {remainingCount > 0 && <p className="mt-2 text-xs text-muted">+{remainingCount} more instance{remainingCount === 1 ? '' : 's'}</p>}

                    {/* PROPOSED SOLUTION + educational context (secondary) */}
                    <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm text-gray-700">
                      <p>
                        <span className="font-semibold text-gray-900">Why it matters: </span>
                        {finding.why_it_matters}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-900">General recommendation: </span>
                        {finding.recommendation}
                      </p>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Container>
  )
}
