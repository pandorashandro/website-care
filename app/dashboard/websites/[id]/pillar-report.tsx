import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav, { type WebsiteSubNavActive } from '@/components/website/website-sub-nav'
import { formatDate, SEVERITY_DISPLAY_ORDER, SEVERITY_LABELS, severityTone } from '@/components/report/report-helpers'
import PillarControls from './pillar-controls'
import PrepareFixButton from './prepare-fix-button'
import { getWordPressConnectionSummary } from './wordpress-capabilities'
import type { Actionability, Confidence, StateValue } from '@/lib/pillars/types'

/** The literal opaque-id prefix wordpress-fix-actions.ts/wordpress-image-alt-fix-actions.ts dispatch on — see their own shared doc comment. Kept here as the ONE place this page constructs that id, so it can never drift from what those two files expect. */
const PILLAR_ISSUE_ID_PREFIX = 'pillar:'

/**
 * Unified webioom engine, Prompt 2 — the ONE shared dedicated-report-page
 * renderer for Performance/Accessibility/Security. All three read from the
 * SAME `pillar_findings`/`pillar_finding_pages` schema (see
 * supabase/migrations/20261111000000_pillar_findings.sql), so rather than
 * writing three nearly-identical 300-line page.tsx files, each pillar's own
 * thin `page.tsx` supplies its config (analyzer version, label, icon,
 * description, analyze action) to this one function.
 *
 * ISSUE-TO-SOLUTION PRESENTATION (this phase's own explicit product
 * requirement): every finding card answers, in order: what's wrong (title),
 * why it matters, where (affected pages/evidence), what to do
 * (recommendation), and can webioom help (one of the four honest action
 * paths below, derived from `actionability` — never a generic "unsafe
 * writer": none of the three new engines' checks currently claim
 * safe_fix/prepared_fix, since no execution backend exists for them yet —
 * see the final report for exactly what that means).
 *
 * WIDE LAYOUT (this phase's own explicit requirement): uses the same `xl`
 * Container size Prompt 1 established for Overview, rather than the
 * narrower size older category pages predate.
 */

type CrawlRunRow = { id: string; status: string; pages_succeeded: number; completed_at: string | null }
type AnalysisRow = { id: string; health_score: number | null; findings_count: number; completed_at: string | null }
type FindingRow = {
  id: string
  check_key: string
  category: string
  scope: string
  finding_kind: 'problem' | 'opportunity'
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: Confidence
  title: string
  explanation: string
  why_it_matters: string
  recommendation: string
  affected_page_count: number
  occurrence_count: number
  actionability: Actionability
}
type FindingInstanceRow = { id: string; finding_id: string; url: string; affected_resource_url: string | null; current_state: StateValue | null; detail: Record<string, unknown> | null }

const ACTION_PATH_LABELS: Record<Actionability, string> = {
  safe_fix: 'WEBIOOM CAN FIX THIS',
  prepared_fix: 'PREPARE WITH AI',
  guided_fix: 'SHOW ME HOW TO FIX IT',
  developer_required: 'SHOW ME HOW (DEVELOPER)',
  monitor: 'MONITOR / MANUAL REVIEW',
}

const ACTION_PATH_TONE: Record<Actionability, 'success' | 'brand' | 'warning' | 'neutral' | 'info'> = {
  safe_fix: 'success',
  prepared_fix: 'brand',
  guided_fix: 'warning',
  developer_required: 'neutral',
  monitor: 'info',
}

const CONFIDENCE_LABELS: Record<Confidence, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }
const MAX_INSTANCES_SHOWN = 8

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

type WordPressFixCapability = { available: boolean; connected: boolean }

/**
 * Unified webioom engine, Prompt 3 — closes the "images_missing_alt has no
 * safe_fix path" blocker for the one image whose src webioom actually
 * captured, WITHOUT changing the finding-level `actionability` badge (which
 * stays the honest 'guided_fix' baseline, since Shopify/Wix never support
 * image-alt and some pages may have only stale, non-per-image evidence).
 * Mirrors components/report/issue-group.tsx's own established pattern
 * exactly: a real per-image Prepare Fix control rendered independently of
 * the group-level fixability label, reusing the SAME PrepareFixButton the
 * legacy scanner's report already uses — see wordpress-fix-actions.ts's own
 * `pillar:` dispatch for how it resolves ownership against the NEW
 * `pillar_finding_pages` table instead of the legacy `issues` table.
 */
function ImageAltFixControl({ websiteId, pageUrl, instance, wordpress }: { websiteId: string; pageUrl: string; instance: FindingInstanceRow; wordpress: WordPressFixCapability }) {
  if (!instance.affected_resource_url) {
    return <p className="mt-2 text-xs text-muted">Re-scan this page to let webioom identify the exact image for a fix.</p>
  }

  if (!wordpress.connected) {
    return (
      <p className="mt-2 text-xs text-muted">
        <Link href={`/dashboard/websites/${websiteId}/integrations`} className="underline hover:text-gray-700">
          Connect your website
        </Link>{' '}
        to let webioom apply this fix automatically.
      </p>
    )
  }

  if (!wordpress.available) {
    return <p className="mt-2 text-xs text-muted">Your connected WordPress account does not have permission to edit media — add the alt text manually (see above).</p>
  }

  return (
    <div className="mt-2">
      <PrepareFixButton
        websiteId={websiteId}
        pageUrl={pageUrl}
        pageLabel={pageUrl}
        issueTitle="Images missing alt text"
        issueId={`${PILLAR_ISSUE_ID_PREFIX}${instance.id}`}
      />
    </div>
  )
}

/**
 * Unified webioom engine, Prompt 3 — Technical Details, consistent across
 * all seven pillars (this file already provides it for the three new ones;
 * the four existing category pages already had their own equivalent
 * evidence display). Default Simple View above stays clean; this collapsed
 * `<details>` exposes exactly what an expert would want to verify a
 * finding — the check identifier, category, scope, confidence, and each
 * instance's raw evidence — as labeled key/value pairs, never a raw JSON
 * dump.
 */
function TechnicalDetails({ finding, instances, analyzerVersion }: { finding: FindingRow; instances: FindingInstanceRow[]; analyzerVersion: string }) {
  return (
    <details className="mt-3 border-t border-border pt-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-subtle">Technical details</summary>
      <div className="mt-2 space-y-1 text-xs text-muted">
        <p>
          <span className="font-medium text-gray-700">Check:</span> {finding.check_key}
        </p>
        <p>
          <span className="font-medium text-gray-700">Category:</span> {finding.category}
        </p>
        <p>
          <span className="font-medium text-gray-700">Scope:</span> {finding.scope === 'site' ? 'Site-wide' : 'Per page'}
        </p>
        <p>
          <span className="font-medium text-gray-700">Confidence:</span> {CONFIDENCE_LABELS[finding.confidence]}
        </p>
        <p>
          <span className="font-medium text-gray-700">Occurrences:</span> {finding.occurrence_count}
        </p>
        <p>
          <span className="font-medium text-gray-700">Analyzer version:</span> {analyzerVersion}
        </p>
      </div>

      {instances.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-700">Evidence</p>
          <ul className="mt-1 space-y-2">
            {instances.map((instance, index) => (
              <li key={`${instance.id}-tech-${index}`} className="rounded-md border border-border bg-surface p-2 text-xs">
                <p className="truncate font-mono text-gray-700">{instance.url}</p>
                {instance.affected_resource_url && <p className="truncate text-muted">Resource: {instance.affected_resource_url}</p>}
                {instance.detail &&
                  Object.entries(instance.detail).map(([key, value]) => (
                    <p key={key} className="text-muted">
                      {key}: {String(value)}
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}

function FindingCard({
  finding,
  instances,
  websiteId,
  wordpress,
  analyzerVersion,
}: {
  finding: FindingRow
  instances: FindingInstanceRow[]
  websiteId: string
  wordpress: WordPressFixCapability
  analyzerVersion: string
}) {
  const shown = instances.slice(0, MAX_INSTANCES_SHOWN)
  const remaining = instances.length - shown.length
  const isImageAltFinding = finding.check_key === 'images_missing_alt'

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{finding.title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {finding.finding_kind === 'problem' && <Badge tone={severityTone(finding.severity)}>{SEVERITY_LABELS[finding.severity]}</Badge>}
          <Badge tone="neutral">{CONFIDENCE_LABELS[finding.confidence]}</Badge>
        </div>
      </div>

      <p className="mt-2 text-sm text-gray-700">{finding.explanation}</p>

      <p className="mt-2 text-xs font-medium text-muted">
        {finding.affected_page_count} page{finding.affected_page_count === 1 ? '' : 's'} affected
      </p>

      <div className="mt-2">
        <Badge tone={ACTION_PATH_TONE[finding.actionability]}>{ACTION_PATH_LABELS[finding.actionability]}</Badge>
      </div>

      {shown.length > 0 && (
        <ul className="mt-3 space-y-2">
          {shown.map((instance, index) => (
            <li key={`${instance.id}-${index}`} className="rounded-md border border-border bg-surface p-3 text-xs">
              <p className="truncate font-medium text-gray-900">{instance.affected_resource_url ?? instance.url}</p>
              {instance.current_state && (
                <p className="mt-1 text-muted">
                  <span className="font-medium">{instance.current_state.label}:</span> {instance.current_state.value ?? '—'}
                </p>
              )}
              {isImageAltFinding && <ImageAltFixControl websiteId={websiteId} pageUrl={instance.url} instance={instance} wordpress={wordpress} />}
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && <p className="mt-2 text-xs text-muted">+{remaining} more page{remaining === 1 ? '' : 's'}</p>}

      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm text-gray-700">
        <p>
          <span className="font-semibold text-gray-900">Why it matters: </span>
          {finding.why_it_matters}
        </p>
        <p>
          <span className="font-semibold text-gray-900">What to do: </span>
          {finding.recommendation}
        </p>
      </div>

      <TechnicalDetails finding={finding} instances={instances} analyzerVersion={analyzerVersion} />
    </Card>
  )
}

export type PillarReportConfig = {
  pillar: 'performance' | 'accessibility' | 'security'
  analyzerVersion: string
  navKey: WebsiteSubNavActive
  label: string
  description: string
  icon: LucideIcon
  emptyStateDescription: string
  analyzeAction: (websiteId: string, crawlRunId: string) => Promise<{ ok: true; findingsCount: number; healthScore: number } | { ok: false; error: string }>
}

export async function renderPillarReportPage(websiteId: string, config: PillarReportConfig) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, name, url')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()
    .returns<{ id: string; name: string; url: string }>()

  if (websiteError || !website) notFound()

  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select('id, status, pages_succeeded, completed_at')
    .eq('website_id', website.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<CrawlRunRow>()

  const isAnalyzableCrawl = crawlRun?.status === 'completed' || crawlRun?.status === 'partial'

  let analysis: AnalysisRow | null = null
  let findings: FindingRow[] = []
  let instancesByFinding = new Map<string, FindingInstanceRow[]>()

  if (crawlRun && isAnalyzableCrawl) {
    const { data: analysisRow } = await supabase
      .from('crawl_analyses')
      .select('id, health_score, findings_count, completed_at')
      .eq('crawl_run_id', crawlRun.id)
      .eq('analyzer_version', config.analyzerVersion)
      .maybeSingle()
      .returns<AnalysisRow>()

    analysis = analysisRow ?? null

    if (analysis) {
      const { data: findingRows } = await supabase
        .from('pillar_findings')
        .select('id, check_key, category, scope, finding_kind, severity, confidence, title, explanation, why_it_matters, recommendation, affected_page_count, occurrence_count, actionability')
        .eq('crawl_analysis_id', analysis.id)
        .eq('pillar', config.pillar)
        .returns<FindingRow[]>()

      findings = findingRows ?? []

      if (findings.length > 0) {
        const { data: instanceRows } = await supabase
          .from('pillar_finding_pages')
          .select('id, finding_id, url, affected_resource_url, current_state, detail')
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

  // Only the Accessibility pillar's images_missing_alt finding currently has
  // a real execution path — no WordPress request is made for
  // Performance/Security pages, which have no use for it.
  const wordpress: WordPressFixCapability =
    config.pillar === 'accessibility'
      ? await (async () => {
          const summary = await getWordPressConnectionSummary(website.id)
          if (!summary.connected) return { connected: false, available: false }
          return { connected: true, available: summary.connectionValid && summary.capabilities.canUploadMedia === 'available' }
        })()
      : { connected: false, available: false }

  const healthScore = analysis?.health_score ?? null
  // The always-on "measurement scope" notice (Core Web Vitals not measured
  // / manual accessibility testing required / security hygiene not a
  // penetration test) is genuinely informational, not a problem or a
  // specific opportunity to act on — shown separately, never mixed into
  // the prioritized problem/opportunity lists.
  const scopeNotice = findings.find((f) => f.category === 'measurement_scope')
  const reportableFindings = findings.filter((f) => f.category !== 'measurement_scope')
  const problems = reportableFindings.filter((f) => f.finding_kind === 'problem')
  const opportunities = reportableFindings.filter((f) => f.finding_kind === 'opportunity')

  const severityCounts: Record<string, number> = {}
  for (const finding of problems) {
    severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1
  }
  const sortedProblems = [...problems].sort((a, b) => SEVERITY_DISPLAY_ORDER.indexOf(a.severity) - SEVERITY_DISPLAY_ORDER.indexOf(b.severity))

  const Icon = config.icon

  return (
    <Container size="xl" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <Card padding="md" className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
            <Icon className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {config.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{config.label}</h1>
          <p className="mt-1 text-sm text-muted">{config.description}</p>
          {analysis?.completed_at && <p className="mt-2 text-sm text-muted">Last analyzed {formatDate(analysis.completed_at)}</p>}
        </div>

        {crawlRun && isAnalyzableCrawl && (
          <div className="sm:w-56 sm:shrink-0">
            <PillarControls websiteId={website.id} crawlRunId={crawlRun.id} hasExistingAnalysis={!!analysis} analyzeAction={config.analyzeAction} />
          </div>
        )}
      </Card>

      <WebsiteSubNav websiteId={website.id} active={config.navKey} />

      {!crawlRun ? (
        <EmptyState
          icon={Icon}
          title="Run a site scan first."
          description={`${config.label} is built from a site-wide crawl. Scan your website from Overview, then come back here to see what webioom found.`}
          action={
            <Link href={`/dashboard/websites/${website.id}`} className={buttonStyles({ variant: 'outline' })}>
              Go to Overview
            </Link>
          }
          className="mt-6"
        />
      ) : !isAnalyzableCrawl ? (
        <Alert tone="info" className="mt-6">
          Your site scan is still {crawlRun.status === 'queued' || crawlRun.status === 'running' ? 'in progress' : 'not usable for analysis'}. Come back once it finishes.
        </Alert>
      ) : crawlRun.status === 'partial' ? (
        <Alert tone="info" className="mt-6">
          This analysis covers only the {crawlRun.pages_succeeded} page{crawlRun.pages_succeeded === 1 ? '' : 's'} webioom crawled before reaching your plan&apos;s page
          limit — not necessarily your entire site.
        </Alert>
      ) : null}

      {crawlRun && isAnalyzableCrawl && !analysis && (
        <EmptyState title="This crawl hasn't been analyzed yet." description="Run analysis to turn your crawl evidence into a report." className="mt-6" />
      )}

      {analysis && crawlRun && (
        <div className="mt-6 space-y-6">
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{config.label} Health</p>
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

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
              <SummaryMetric label="Pages analyzed" value={crawlRun.pages_succeeded} />
              <SummaryMetric label="Problems" value={problems.length} />
              <SummaryMetric label="Opportunities" value={opportunities.length} />
            </div>
          </Card>

          {scopeNotice && (
            <Alert tone="info">
              <p className="font-medium text-gray-900">{scopeNotice.title}</p>
              <p className="mt-1">{scopeNotice.explanation}</p>
            </Alert>
          )}

          {problems.length === 0 ? (
            <EmptyState title={`No ${config.label.toLowerCase()} problems found`} description={config.emptyStateDescription} />
          ) : (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">What should I fix?</h2>
              {sortedProblems.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  instances={instancesByFinding.get(finding.id) ?? []}
                  websiteId={website.id}
                  wordpress={wordpress}
                  analyzerVersion={config.analyzerVersion}
                />
              ))}
            </div>
          )}

          {opportunities.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Opportunities</h2>
                <p className="mt-1 text-sm text-muted">Suggestions for already-adequate pages — these do not affect your {config.label} score.</p>
              </div>
              {opportunities.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  instances={instancesByFinding.get(finding.id) ?? []}
                  websiteId={website.id}
                  wordpress={wordpress}
                  analyzerVersion={config.analyzerVersion}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Container>
  )
}
