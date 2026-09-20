import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ANALYZER_VERSION } from '@/lib/on-page/types'
import type { FindingCategory, FindingScope, Confidence, Actionability, StateValue } from '@/lib/on-page/types'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import { formatDate, SEVERITY_DISPLAY_ORDER, SEVERITY_LABELS, severityTone } from '@/components/report/report-helpers'
import OnPageSeoControls from './on-page-seo-controls'
import { getWordPressConnectionSummary, toIntegrationFixabilityInputs } from '../wordpress-capabilities'
import { getShopifyConnectionStatus, toShopifyIssueFixabilityInputs } from '../shopify-connection-status'
import { getWixConnectionStatus, toWixIssueFixabilityInputs } from '../wix-connection-status'
import { evaluateShopifyIssueFixability } from '@/lib/integrations/shopify/issue-fixability'
import { evaluateWixIssueFixability } from '@/lib/integrations/wix/issue-fixability'
import PrepareFixButton from '../prepare-fix-button'
import ShopifyPrepareFixButton from '../shopify-prepare-fix-button'
import WixPrepareFixButton from '../wix-prepare-fix-button'

/**
 * Phase 28 — the On-Page SEO product surface, mirroring
 * app/dashboard/websites/[id]/site-architecture/page.tsx's own
 * solution-first hierarchy exactly: PROBLEM -> IMPACT/PRIORITY -> AFFECTED
 * PAGES -> EXACT EVIDENCE -> PROPOSED SOLUTION -> ACTION, preceded by
 * beginner-friendly summary metrics.
 *
 * Reads crawl_runs/crawl_analyses/on_page_findings/on_page_finding_pages
 * directly via the ordinary session-aware client — no admin client, no
 * write of any kind happens on this page. The On-Page SEO health score
 * shown here is `crawl_analyses.health_score` for THIS analyzer_version,
 * read verbatim — NEVER recomputed on this page — the exact same row
 * Overview's Category Health grid reads via getOnPageCategorySummary (see
 * app/dashboard/websites/[id]/on-page-summary.ts).
 *
 * Phase 28 real-world evidence validation — actionability truthfulness
 * correction: `prepared_fix` (lib/on-page/actionability.ts) correctly
 * classifies WHICH CHECKS have a real Preview -> Apply -> Verify -> Rollback
 * backend AT ALL (title/meta-description length issues, missing H1 — see
 * that module's own doc comment), but that backend is WordPress-specific
 * and requires an actually-connected, capable integration to execute for
 * THIS website. The static `CHECK_ACTIONABILITY` classification has no way
 * to know a given website's live connection state, so showing "SOLUTION
 * READY FOR APPROVAL" unconditionally would overclaim execution readiness
 * for a site with no WordPress connection (or Shopify/Wix, which the
 * canonical On-Page engine's prepared_fix path does not cover at all — only
 * the legacy report's separate fixability system does). This page now
 * reuses the SAME `getWordPressConnectionSummary`/`toIntegrationFixabilityInputs`
 * helpers the Overview report already uses for identical live-capability
 * gating, to add an honest qualifier caption under a `prepared_fix`
 * badge when no working connection exists — it does not change
 * `finding.actionability` itself and does not touch scoring.
 *
 * PAYABLE-V1 PRODUCT COMPLETION: `prepared_fix` findings now render a real
 * Prepare Fix button — previously this page only ever showed a static
 * badge with no way to actually act on it, so the real remediation
 * pipelines were completely unreachable from this canonical report (only
 * reachable via the legacy `scans`/`issues` tables, which the unified
 * "Scan Website" action never populates).
 *
 * PLATFORM-AGNOSTIC CLOSURE: the correct button is chosen per finding based
 * on which platform is ACTUALLY connected and capable for THIS website —
 * never assumed from which platforms exist in the product. WordPress takes
 * priority when connected+capable (existing behavior, unchanged); otherwise
 * Shopify, then Wix, each evaluated via their own existing
 * evaluateShopifyIssueFixability/evaluateWixIssueFixability (which already
 * return null for anything outside title/meta_description — H1 stays
 * WordPress-only, honestly, since neither other platform's adapter can
 * write it). Shopify/Wix reach the canonical finding through
 * on-page-finding-issue.ts's resolvers (the same `onpage:`-prefix pattern
 * accessibility-image-alt-finding.ts established for Accessibility) —
 * their own existing prepare/apply/verify/rollback pipelines are entirely
 * unchanged. No new execution path was built for any platform: this reuses
 * the identical server actions, entitlement gate, preview tokens, and
 * verification/history/rollback machinery that already existed — only the
 * ownership-resolution step needed a second, symmetric implementation per
 * platform, plus the canonical engine's own title strings needing to be
 * recognized by the shared classifier (lib/fixes/fix-preview.ts).
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
  id: string
  finding_id: string
  url: string
  affected_resource_url: string | null
  current_state: StateValue | null
  desired_state: StateValue | null
  proposed_change: string | null
}

const ON_PAGE_ISSUE_ID_PREFIX = 'onpage:'

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  title: 'Title',
  meta_description: 'Meta Description',
  headings: 'Headings',
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
    parts.push(`${finding.unique_target_count} duplicate group${finding.unique_target_count === 1 ? '' : 's'}`)
  }

  return parts.join(' · ')
}

function findingCountByKey(findings: FindingRow[], checkKey: string): number {
  return findings.find((f) => f.check_key === checkKey)?.affected_page_count ?? 0
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
    <div className="rounded-md border border-border bg-surface p-3 text-xs">
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
    </div>
  )
}

export default async function OnPageSeoPage(props: PageProps<'/dashboard/websites/[id]/on-page-seo'>) {
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

  // Kicked off early, in parallel with the crawl/analysis queries below —
  // mirrors app/dashboard/websites/[id]/page.tsx's own "kick off early"
  // pattern for these same live capability checks. Not persisted;
  // recomputed on every render, same as the Overview report.
  const wordpressConnectionPromise = getWordPressConnectionSummary(website.id)
  const shopifyConnectionPromise = getShopifyConnectionStatus(website.id)
  const wixConnectionPromise = getWixConnectionStatus(website.id)

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
        .from('on_page_findings')
        .select('id, check_key, category, scope, severity, confidence, title, explanation, why_it_matters, recommendation, affected_page_count, occurrence_count, unique_target_count, actionability')
        .eq('crawl_analysis_id', analysis.id)
        .returns<FindingRow[]>()

      findings = findingRows ?? []

      if (findings.length > 0) {
        const { data: instanceRows } = await supabase
          .from('on_page_finding_pages')
          .select('id, finding_id, url, affected_resource_url, current_state, desired_state, proposed_change')
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

  // Truthfulness correction (see this file's own top doc comment): a
  // `prepared_fix` badge only means "webioom can genuinely apply this
  // right now" when a REAL connected, capable platform integration exists
  // for THIS website — never implied universally, and never assumed to be
  // WordPress just because that was the first platform wired.
  const wordpressConnection = await wordpressConnectionPromise
  const { connectionState, capabilities } = toIntegrationFixabilityInputs(wordpressConnection)
  const hasWorkingPreparedFixBackend = connectionState === 'connected' && capabilities?.edit_content === 'available'

  const shopifyConnection = await shopifyConnectionPromise
  const wixConnection = await wixConnectionPromise
  const shopifyFixabilityInputs = toShopifyIssueFixabilityInputs(shopifyConnection)
  const wixFixabilityInputs = toWixIssueFixabilityInputs(wixConnection)

  /**
   * Platform priority mirrors Overview's own getFixability dispatch order
   * (WordPress, then Shopify, then Wix) for consistency — WordPress's own
   * result is untouched when it already resolves working, so an existing
   * WordPress-connected website renders byte-for-byte the same as before
   * either other platform's canonical wiring existed. Returns null (never
   * a fake provider) for anything outside prepared_fix, or when no
   * connected platform can actually execute this specific finding.
   */
  function getFixProvider(finding: FindingRow): 'wordpress' | 'shopify' | 'wix' | null {
    if (finding.actionability !== 'prepared_fix') return null
    if (hasWorkingPreparedFixBackend) return 'wordpress'

    const shopifyResult = evaluateShopifyIssueFixability({ issueTitle: finding.title, ...shopifyFixabilityInputs })
    if (shopifyResult?.level === 'assisted') return 'shopify'

    const wixResult = evaluateWixIssueFixability({ issueTitle: finding.title, connectionState: wixFixabilityInputs.connectionState })
    if (wixResult?.level === 'assisted') return 'wix'

    return null
  }

  const severityCounts: Record<string, number> = {}
  for (const finding of findings) {
    severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1
  }

  const sortedFindings = [...findings].sort((a, b) => SEVERITY_DISPLAY_ORDER.indexOf(a.severity) - SEVERITY_DISPLAY_ORDER.indexOf(b.severity))

  return (
    <Container size="xl" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <Card padding="md" className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">On-Page SEO</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">On-Page SEO</h1>
          <p className="mt-1 text-sm text-muted">How well each page&apos;s title, meta description, and headings are optimized for search.</p>

          {analysis && (
            <p className="mt-2 text-sm text-muted">Last analyzed {analysis.completed_at ? formatDate(analysis.completed_at) : 'recently'}</p>
          )}
        </div>

        {crawlRun && isAnalyzableCrawl && (
          <div className="sm:w-56 sm:shrink-0">
            <OnPageSeoControls websiteId={website.id} crawlRunId={crawlRun.id} hasExistingAnalysis={!!analysis} />
          </div>
        )}
      </Card>

      <WebsiteSubNav websiteId={website.id} active="on-page-seo" />

      {!crawlRun ? (
        <EmptyState
          icon={Search}
          title="Scan your website first."
          description="On-Page SEO analysis is built from your website scan. Run a scan from the Overview page, then come back here to see what webioom found."
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
          plan&apos;s page limit — not necessarily your entire site. Every finding below describes what was actually observed among the pages analyzed; it
          is not a claim about pages webioom has not yet seen.
        </Alert>
      ) : null}

      {crawlRun && isAnalyzableCrawl && !analysis && (
        <EmptyState
          title="This crawl hasn't been analyzed yet."
          description="Run analysis to turn your crawl evidence into an On-Page SEO diagnosis."
          className="mt-6"
        />
      )}

      {analysis && crawlRun && (
        <div className="mt-6 space-y-6">
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">On-Page SEO Health</p>
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
              <SummaryMetric label="Missing titles" value={findingCountByKey(findings, 'missing_title')} />
              <SummaryMetric label="Duplicate titles" value={findingCountByKey(findings, 'duplicate_title')} />
              <SummaryMetric label="Missing meta descriptions" value={findingCountByKey(findings, 'missing_meta_description')} />
              <SummaryMetric label="Missing H1s" value={findingCountByKey(findings, 'missing_h1')} />
              <SummaryMetric label="Multiple H1s" value={findingCountByKey(findings, 'multiple_h1')} />
            </div>
          </Card>

          {findings.length === 0 ? (
            <EmptyState title="No on-page problems found" description="webioom didn't detect any of the on-page conditions it currently checks for." />
          ) : (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Biggest on-page opportunities</h2>
              {sortedFindings.map((finding) => {
                const instances = instancesByFinding.get(finding.id) ?? []
                const shownInstances = instances.slice(0, MAX_INSTANCES_SHOWN)
                const remainingCount = instances.length - shownInstances.length
                const fixProvider = getFixProvider(finding)
                // Only 'title'/'meta_description' ever reach a Shopify/Wix
                // provider — evaluateShopifyIssueFixability/
                // evaluateWixIssueFixability both return null for
                // 'headings', so fixProvider can never be 'shopify'/'wix'
                // for an H1 finding; this cast is safe, not assumed.
                const shopifyWixFixKind = finding.category as 'title' | 'meta_description'

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

                    {/* AFFECTED PAGES */}
                    <p className="mt-2 text-xs font-medium text-muted">{countsSummary(finding)}</p>

                    {/* ACTIONABILITY */}
                    <div className="mt-2">
                      <Badge tone={ACTIONABILITY_TONE[finding.actionability]}>{ACTIONABILITY_LABELS[finding.actionability]}</Badge>
                      {finding.actionability === 'prepared_fix' && !fixProvider && (
                        <p className="mt-1 text-xs text-muted">
                          <Link href={`/dashboard/websites/${website.id}/integrations`} className="underline hover:text-gray-700">
                            Connect your website
                          </Link>{' '}
                          to let webioom apply this fix automatically.
                        </p>
                      )}
                    </div>

                    {/* EXACT EVIDENCE */}
                    {shownInstances.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {shownInstances.map((instance, index) => (
                          <li key={`${instance.url}-${instance.affected_resource_url ?? index}`}>
                            <InstanceRow instance={instance} />
                            {fixProvider === 'wordpress' && (
                              <PrepareFixButton
                                websiteId={website.id}
                                pageUrl={instance.url}
                                pageLabel={instance.url}
                                issueTitle={finding.title}
                              />
                            )}
                            {fixProvider === 'shopify' && (
                              <ShopifyPrepareFixButton
                                websiteId={website.id}
                                pageLabel={instance.url}
                                issueId={`${ON_PAGE_ISSUE_ID_PREFIX}${instance.id}`}
                                fixKind={shopifyWixFixKind}
                              />
                            )}
                            {fixProvider === 'wix' && (
                              <WixPrepareFixButton
                                websiteId={website.id}
                                pageLabel={instance.url}
                                issueId={`${ON_PAGE_ISSUE_ID_PREFIX}${instance.id}`}
                                fixKind={shopifyWixFixKind}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {remainingCount > 0 && <p className="mt-2 text-xs text-muted">+{remainingCount} more page{remainingCount === 1 ? '' : 's'}</p>}

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
