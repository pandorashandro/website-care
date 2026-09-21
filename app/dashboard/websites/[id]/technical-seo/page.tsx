import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/technical-seo/types'
import type { FindingCategory, FindingScope, Confidence, Actionability, StateValue } from '@/lib/technical-seo/types'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import PillarSubNav from '@/components/website/pillar-sub-nav'
import FindingList, { type NormalizedFinding } from '@/components/report/finding-list'
import { formatDate, SEVERITY_DISPLAY_ORDER, SEVERITY_LABELS, severityTone } from '@/components/report/report-helpers'
import TechnicalSeoControls from './technical-seo-controls'

/**
 * Phase 26B — the Technical SEO product surface, redesigned (Checkpoint 10)
 * around a solution-first hierarchy: PROBLEM -> IMPACT/PRIORITY -> AFFECTED
 * ASSETS -> EXACT EVIDENCE -> PROPOSED SOLUTION -> ACTION. Plain-language
 * explanation remains present but secondary to concrete evidence.
 *
 * Reads crawl_runs/crawl_analyses/technical_findings/technical_finding_pages
 * directly via the ordinary session-aware client (RLS-scoped exactly like
 * every other read on the Site Scan/Overview pages) — no admin client, no
 * write of any kind happens on this page. The Technical SEO health score
 * shown here is `crawl_analyses.health_score`, read verbatim — NEVER
 * recomputed on this page (Checkpoint 12) — the exact same row Overview's
 * Category Health grid reads via getTechnicalSeoCategorySummary (see
 * app/dashboard/websites/[id]/technical-seo-summary.ts).
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
  crawlability: 'Crawlability',
  indexability: 'Indexability',
  canonicals: 'Canonicals',
  redirects: 'Redirects',
  robots: 'Robots.txt',
  sitemap: 'XML Sitemap',
  url_protocol: 'URL & Protocol',
  technical_page: 'Page Signals',
  structured_data: 'Structured Data',
  internationalization: 'Internationalization',
  site_wide_consistency: 'Site-Wide Patterns',
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

const MAX_INSTANCES_SHOWN = 8

/** Checkpoint 9/10 — never conflate occurrences, source pages, and unique targets; only mention a count when it's actually meaningful for this finding. */
function countsSummary(finding: FindingRow): string {
  const parts: string[] = []
  parts.push(`${finding.affected_page_count} source page${finding.affected_page_count === 1 ? '' : 's'}`)

  if (finding.unique_target_count > 0) {
    parts.push(`${finding.unique_target_count} unique target${finding.unique_target_count === 1 ? '' : 's'}`)
  }
  if (finding.occurrence_count !== finding.affected_page_count) {
    parts.push(`${finding.occurrence_count} occurrence${finding.occurrence_count === 1 ? '' : 's'}`)
  }

  return parts.join(' · ')
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

export default async function TechnicalSeoPage(props: PageProps<'/dashboard/websites/[id]/technical-seo'>) {
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
      .select('id, health_score, completed_at')
      .eq('crawl_run_id', crawlRun.id)
      .eq('analyzer_version', ANALYZER_VERSION)
      .maybeSingle()
      .returns<AnalysisRow>()

    analysis = analysisRow ?? null

    if (analysis) {
      const { data: findingRows } = await supabase
        .from('technical_findings')
        .select(
          'id, check_key, category, scope, severity, confidence, title, explanation, why_it_matters, recommendation, affected_page_count, occurrence_count, unique_target_count, actionability'
        )
        .eq('crawl_analysis_id', analysis.id)
        .returns<FindingRow[]>()

      findings = findingRows ?? []

      if (findings.length > 0) {
        const { data: instanceRows } = await supabase
          .from('technical_finding_pages')
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

  // Checkpoint 12: the score is read verbatim from the persisted analysis
  // row — NEVER recomputed on this page. A null health_score (a legacy
  // technical-v1 row, or an analysis that never completed) is shown as
  // "not available" rather than silently substituting a fake number.
  const healthScore = analysis?.health_score ?? null

  const severityCounts: Record<string, number> = {}
  for (const finding of findings) {
    severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1
  }

  const sortedFindings = [...findings].sort((a, b) => SEVERITY_DISPLAY_ORDER.indexOf(a.severity) - SEVERITY_DISPLAY_ORDER.indexOf(b.severity))

  return (
    <Container size="2xl" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <Card padding="md" className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Technical SEO</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Technical SEO diagnosis</h1>
          <p className="mt-1 text-sm text-muted">Problems, evidence, and solutions from your latest site scan.</p>

          {analysis && (
            <p className="mt-2 text-sm text-muted">Last analyzed {analysis.completed_at ? formatDate(analysis.completed_at) : 'recently'}</p>
          )}
        </div>

        {crawlRun && isAnalyzableCrawl && (
          <div className="sm:w-56 sm:shrink-0">
            <TechnicalSeoControls websiteId={website.id} crawlRunId={crawlRun.id} hasExistingAnalysis={!!analysis} />
          </div>
        )}
      </Card>

      <WebsiteSubNav websiteId={website.id} active="technical-seo" />
      <PillarSubNav websiteId={website.id} active="technical-seo" />

      {!crawlRun ? (
        <EmptyState
          icon={Wrench}
          title="Scan your website first."
          description="Technical SEO diagnosis is built from your website scan. Run a scan from the Overview page, then come back here to see what webioom found."
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
          plan&apos;s page limit — not your entire site. Additional, uncrawled pages may contain issues not reflected here or in the score below.
        </Alert>
      ) : null}

      {crawlRun && isAnalyzableCrawl && !analysis && (
        <EmptyState
          title="This crawl hasn't been analyzed yet."
          description="Run analysis to turn your crawl evidence into a Technical SEO diagnosis."
          className="mt-6"
        />
      )}

      {analysis && (
        <div className="mt-6 space-y-6">
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Technical SEO Health</p>
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
            <p className="mt-3 text-sm text-muted">
              {findings.length === 0
                ? 'No technical SEO problems found in the crawled pages.'
                : `${findings.length} technical SEO finding${findings.length === 1 ? '' : 's'} across ${crawlRun?.pages_succeeded ?? 0} analyzed page${crawlRun?.pages_succeeded === 1 ? '' : 's'}.`}
            </p>
          </Card>

          {findings.length === 0 ? (
            <EmptyState title="No technical SEO problems found" description="webioom didn't detect any of the technical conditions it currently checks for." />
          ) : (
            <FindingList
              findings={sortedFindings.map((finding): NormalizedFinding => {
                const instances = instancesByFinding.get(finding.id) ?? []
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
                        {remainingCount > 0 && <p className="mt-2 text-xs text-muted">+{remainingCount} more instance{remainingCount === 1 ? '' : 's'}</p>}
                      </>
                    ) : undefined,
                }
              })}
            />
          )}
        </div>
      )}
    </Container>
  )
}
