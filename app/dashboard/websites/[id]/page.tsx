import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ScanSearch } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import ScanWebsiteButton from '@/app/dashboard/scan-website-button'
import { aggregateIssues, type RawIssueRow } from '@/lib/scanner/aggregate-issues'
import { calculateHealthScore } from '@/lib/scanner/calculate-health-score'
import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import { detectWordPress } from '@/lib/integrations/wordpress/detect-wordpress'
import { getWordPressConnectionSummary, toIntegrationFixabilityInputs } from './wordpress-capabilities'
import { evaluateFixability } from '@/lib/fixes/fixability'
import RecentFixes from './recent-fixes'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import HealthOverview from '@/components/report/health-overview'
import CategoryScoreGrid from '@/components/report/category-score-grid'
import PriorityIssues from '@/components/report/priority-issues'
import IssueGroup from '@/components/report/issue-group'
import {
  type DecoratedIssue,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  formatDate,
  isKnownCategory,
  SEVERITY_DISPLAY_ORDER,
  SEVERITY_LABELS,
  severityTone,
} from '@/components/report/report-helpers'

type Website = {
  id: string
  name: string
  url: string
  created_at: string
}

type Scan = {
  id: string
  status: 'running' | 'completed' | 'failed'
  score: number | null
  created_at: string
}

type Issue = RawIssueRow & { id: string }

const TOP_ISSUE_COUNT = 3

export default async function WebsiteReportPage(props: PageProps<'/dashboard/websites/[id]'>) {
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
    .select('id, name, url, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
    .returns<Website>()

  if (websiteError || !website) {
    notFound()
  }

  // Both kicked off early so they run concurrently with the Supabase queries
  // below rather than adding their network latency on top of them. Neither
  // is persisted (no schema change) — both are recomputed live on every
  // report render. getWordPressConnectionSummary independently re-verifies
  // session + ownership itself; it does not trust this page's earlier check.
  const wordpressPromise = detectWordPress(website.url)
  const wordpressConnectionPromise = getWordPressConnectionSummary(website.id)

  const { data: latestScan } = await supabase
    .from('scans')
    .select('id, status, score, created_at')
    .eq('website_id', website.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<Scan>()

  let issues: Issue[] = []

  if (latestScan && latestScan.status === 'completed') {
    const { data: issueRows } = await supabase
      .from('issues')
      .select('id, page_url, type, severity, title, description, recommendation, image_url')
      .eq('scan_id', latestScan.id)
      .returns<Issue[]>()

    issues = issueRows ?? []
  }

  const severityCounts: Record<string, number> = {}
  for (const issue of issues) {
    severityCounts[issue.severity] = (severityCounts[issue.severity] ?? 0) + 1
  }

  // Only pages with at least one issue can be counted this way (schema has
  // no separate "pages crawled" record), so this is a lower bound, not the
  // exact page count.
  const pageUrlsWithIssues = new Set(
    issues.map((issue) => issue.page_url).filter((url): url is string => !!url)
  )

  const aggregatedIssues = aggregateIssues(issues, website.url)

  // aggregateIssues collapses every missing_image_alt row into one summary
  // group (by title/type/severity), which is exactly right for scoring but
  // loses per-image identity — so for THIS one issue type, derive the exact
  // (page, image) pairs directly from the raw rows instead of ever picking
  // "the first affected page" the way every other issue type does. Legacy
  // rows from before image_url existed (image_url === null) are excluded
  // rather than guessed at — they simply won't offer a per-image Prepare Fix
  // until the site is scanned again.
  const missingImageAltInstances = Array.from(
    new Map(
      issues
        .filter((issue) => issue.title === ISSUE_DEFINITIONS.missing_image_alt.title && issue.image_url)
        .map((issue) => [
          `${issue.page_url ?? website.url}|${issue.image_url}`,
          { issueId: issue.id, pageUrl: issue.page_url ?? website.url, imageUrl: issue.image_url as string },
        ])
    ).values()
  )

  // Always computed live from the latest scan's issues (never read from the
  // stored scans.score) so legacy scans — created before this scoring model
  // existed — display correctly without a database rewrite.
  const healthScore =
    latestScan?.status === 'completed' ? calculateHealthScore(issues, website.url) : null

  // Onboarding context only — a simple count against the existing scans
  // table, not a new table or persisted "onboarding" state. Only ever
  // queried when there's a completed scan to contextualize.
  let isFirstReport = false
  if (latestScan?.status === 'completed') {
    const { count: completedScanCount } = await supabase
      .from('scans')
      .select('id', { count: 'exact', head: true })
      .eq('website_id', website.id)
      .eq('status', 'completed')
    isFirstReport = completedScanCount === 1
  }

  const wordpress = await wordpressPromise
  const wordpressConnection = await wordpressConnectionPromise

  // Centralizes fixability evaluation — pure, deterministic, and does not
  // affect priority ranking or health scoring, which are computed
  // independently above. Phase 19.4: the WordPress-specific connection
  // summary is translated to fixability's generic inputs via the thin
  // wordpress-capabilities.ts mapper — evaluateFixability itself no longer
  // knows anything WordPress-specific.
  const { connectionState, capabilities } = toIntegrationFixabilityInputs(wordpressConnection)

  function getFixability(issueTitle: string) {
    return evaluateFixability({
      issueTitle,
      integrationDetected: wordpress.status !== 'unknown',
      connectionState,
      capabilities,
    })
  }

  // Decorated once, server-side, with a stable anchor id (so "Needs your
  // attention" can link straight to a card below) and its fixability result
  // — neither aggregateIssues nor evaluateFixability is changed by this.
  const decoratedIssues: DecoratedIssue[] = aggregatedIssues.map((issue, index) => ({
    ...issue,
    anchorId: `issue-${index}`,
    fixability: getFixability(issue.title),
  }))

  const topIssues = decoratedIssues.slice(0, TOP_ISSUE_COUNT)
  const hasActionableIssue = decoratedIssues.some((issue) => issue.fixability.level !== 'unavailable')

  const groupedByCategory = CATEGORY_ORDER.map((category) => ({
    category,
    issues: decoratedIssues.filter((issue) => issue.type === category),
  })).filter((group) => group.issues.length > 0)

  // Defensive only — every current issue-definition type is one of the five
  // known categories, so this should always be empty in practice. Exists so
  // an issue can never silently vanish from the report if that ever changes.
  const otherIssues = decoratedIssues.filter((issue) => !isKnownCategory(issue.type))

  return (
    <Container size="md" className="py-10">
      <Link href="/dashboard" className="text-sm text-muted hover:text-gray-700">
        ← Back to Websites
      </Link>

      <Card padding="md" className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Website Overview</p>
          <h1 className="mt-1 truncate text-2xl font-semibold text-gray-900">{website.name}</h1>
          <a
            href={website.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-sm text-muted hover:text-gray-700"
          >
            {website.url}
          </a>

          <p className="mt-3 text-sm text-muted">
            {!latestScan
              ? 'Not scanned yet'
              : latestScan.status === 'completed'
                ? `Last scanned ${formatDate(latestScan.created_at)}`
                : latestScan.status === 'running'
                  ? 'Scan in progress…'
                  : latestScan.status === 'failed'
                    ? 'The last scan failed.'
                    : 'Scan status unavailable.'}
          </p>
        </div>

        <div className="sm:w-48 sm:shrink-0">
          <ScanWebsiteButton websiteId={website.id} label={latestScan ? 'Scan Again' : 'Run First Scan'} />
        </div>
      </Card>

      <WebsiteSubNav websiteId={website.id} active="overview" />

      {latestScan?.status === 'running' && (
        <Alert tone="info" className="mt-6">
          Scanning your website now. webioom is preparing your health report — it will appear here once
          scanning completes.
        </Alert>
      )}

      {latestScan?.status === 'failed' && (
        <Alert tone="danger" className="mt-6">
          The last scan for this website failed. Try scanning again above.
        </Alert>
      )}

      {!latestScan && (
        <EmptyState
          icon={ScanSearch}
          title="Your website is ready for its first scan."
          description="Run a scan to create your website health report. webioom checks the website and organizes findings by health category and priority."
          action={<ScanWebsiteButton websiteId={website.id} label="Run First Scan" />}
          className="mt-6"
        />
      )}

      {latestScan?.status === 'completed' && healthScore && (
        <div className="mt-6 space-y-6">
          {isFirstReport && issues.length > 0 && (
            <Alert tone="success">
              <p>
                Your first health report is ready. Start with Needs Your Attention below — these are the
                findings webioom has prioritized first.
              </p>
              {hasActionableIssue && (
                <p className="mt-1.5">
                  Some findings can be prepared for review directly in webioom; others include guided
                  recommendations you can act on yourself. You&apos;ll always see the proposed change before
                  anything is applied.
                </p>
              )}
            </Alert>
          )}

          {Object.values(severityCounts).some((count) => count > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {SEVERITY_DISPLAY_ORDER.filter((severity) => severityCounts[severity] > 0).map((severity) => (
                <Badge key={severity} tone={severityTone(severity)}>
                  {severityCounts[severity]} {SEVERITY_LABELS[severity]}
                </Badge>
              ))}
            </div>
          )}

          <HealthOverview overall={healthScore.overall} issueCount={issues.length} pageCount={pageUrlsWithIssues.size} />

          <CategoryScoreGrid categories={healthScore.categories} />

          {issues.length === 0 ? (
            <EmptyState
              title="No issues found in this scan"
              description="webioom didn't detect any of the issues covered by the current scan."
            />
          ) : (
            <>
              <PriorityIssues issues={topIssues} />

              <div>
                <h2 className="text-base font-semibold text-gray-900">Website Report</h2>
                <p className="mt-1 text-sm text-muted">
                  {issues.length} total issue{issues.length === 1 ? '' : 's'} across {aggregatedIssues.length} unique
                  issue type{aggregatedIssues.length === 1 ? '' : 's'}
                </p>

                <div className="mt-4 space-y-8">
                  {groupedByCategory.map((group) => (
                    <div key={group.category}>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">
                        {CATEGORY_LABELS[group.category]}
                      </h3>
                      <div className="mt-3 space-y-3">
                        {group.issues.map((issue) => (
                          <IssueGroup
                            key={issue.anchorId}
                            issue={issue}
                            websiteId={website.id}
                            missingImageAltInstances={
                              issue.title === ISSUE_DEFINITIONS.missing_image_alt.title ? missingImageAltInstances : []
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {otherIssues.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">Other</h3>
                      <div className="mt-3 space-y-3">
                        {otherIssues.map((issue) => (
                          <IssueGroup key={issue.anchorId} issue={issue} websiteId={website.id} missingImageAltInstances={[]} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <Card padding="md" className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Integration</h2>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">WordPress</span>
            {!wordpressConnection.connected ? (
              <Badge tone="neutral">Not connected</Badge>
            ) : wordpressConnection.connectionValid ? (
              <Badge tone="success">Connected</Badge>
            ) : (
              <Badge tone="warning">Needs attention</Badge>
            )}
          </div>

          <Link
            href={`/dashboard/websites/${website.id}/integrations`}
            className={buttonStyles({ variant: 'outline', size: 'sm' })}
          >
            Manage Integration
          </Link>
        </div>

        <p className="mt-2 text-sm text-muted">
          {wordpressConnection.connected && wordpressConnection.connectionValid
            ? 'webioom can use this integration for supported fix workflows.'
            : wordpressConnection.connected
              ? 'This connection needs attention before webioom can use it.'
              : latestScan?.status === 'completed'
                ? 'Want webioom to help apply supported changes? Connect a supported integration.'
                : 'Scanning and reports still work without it.'}
        </p>
      </Card>

      <div className="mt-6">
        <RecentFixes websiteId={website.id} />
      </div>
    </Container>
  )
}
