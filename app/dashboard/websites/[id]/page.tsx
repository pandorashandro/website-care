import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ScanSearch } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import ScanWebsiteButton from '@/app/dashboard/scan-website-button'
import { aggregateIssues, type RawIssueRow } from '@/lib/scanner/aggregate-issues'
import { calculateHealthScore } from '@/lib/scanner/calculate-health-score'
import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import { detectWordPress } from '@/lib/integrations/wordpress/detect-wordpress'
import type { CapabilityValue, WordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'
import { getWordPressConnectionSummary } from './wordpress-capabilities'
import { evaluateFixability } from '@/lib/fixes/fixability'
import ConnectWordPressButton from './connect-wordpress-button'
import DisconnectWordPressButton from './disconnect-wordpress-button'
import RecentFixes from './recent-fixes'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
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

const PERMISSION_ROWS: { key: keyof WordPressCapabilities; label: string }[] = [
  { key: 'canEditPages', label: 'Edit pages' },
  { key: 'canEditPosts', label: 'Edit posts' },
  { key: 'canPublishPosts', label: 'Publish content' },
  { key: 'canUploadMedia', label: 'Upload media' },
]

const CAPABILITY_LABELS: Record<CapabilityValue, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
}

const CAPABILITY_TEXT_CLASS: Record<CapabilityValue, string> = {
  available: 'font-medium text-green-700',
  unavailable: 'font-medium text-gray-400',
  unknown: 'font-medium text-gray-400',
}

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

  const wordpress = await wordpressPromise
  const wordpressConnection = await wordpressConnectionPromise

  // Centralizes fixability evaluation — pure, deterministic, and does not
  // affect priority ranking or health scoring, which are computed
  // independently above.
  function getFixability(issueTitle: string) {
    return evaluateFixability({
      issueTitle,
      wordpressDetected: wordpress.status !== 'unknown',
      wordpressConnected: wordpressConnection.connected,
      connectionValid: wordpressConnection.connected ? wordpressConnection.connectionValid : false,
      capabilities:
        wordpressConnection.connected && wordpressConnection.connectionValid
          ? wordpressConnection.capabilities
          : null,
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

      {latestScan?.status === 'running' && (
        <Alert tone="info" className="mt-6">
          Scanning this website now. The health report will appear here once it completes.
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
          title="No health report yet"
          description="Run the first scan to analyze this website."
          action={<ScanWebsiteButton websiteId={website.id} label="Run First Scan" />}
          className="mt-6"
        />
      )}

      {latestScan?.status === 'completed' && healthScore && (
        <div className="mt-6 space-y-6">
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
            <EmptyState title="No issues found" description="This website passed every check in its latest scan." />
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

        {wordpress.status === 'unknown' ? (
          <p className="mt-2 text-sm text-muted">WordPress not confirmed for this website.</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-gray-900">
                {wordpress.status === 'confirmed' ? 'WordPress' : 'WordPress likely'}
              </span>
              <Badge tone={wordpress.status === 'confirmed' ? 'success' : 'warning'}>
                {wordpress.status === 'confirmed' ? 'Detected' : 'Likely'}
              </Badge>
            </div>

            {wordpress.status === 'likely' && (
              <p className="mt-1 text-sm text-muted">We found several WordPress signals.</p>
            )}

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted">REST API</dt>
                <dd className="font-medium text-gray-900">
                  {wordpress.restApiAvailable ? 'Available' : 'Unavailable'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Connection</dt>
                <dd
                  className={`font-medium ${
                    wordpressConnection.connected && !wordpressConnection.connectionValid
                      ? 'text-yellow-700'
                      : 'text-gray-900'
                  }`}
                >
                  {!wordpressConnection.connected
                    ? 'Not connected'
                    : wordpressConnection.connectionValid
                      ? 'Connected ✓'
                      : 'Needs attention'}
                </dd>
              </div>
              {wordpressConnection.connected &&
                wordpressConnection.connectionValid &&
                wordpressConnection.displayName && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Connected as</dt>
                    <dd className="font-medium text-gray-900">{wordpressConnection.displayName}</dd>
                  </div>
                )}
            </dl>

            {wordpressConnection.connected && !wordpressConnection.connectionValid && (
              <p className="mt-2 text-sm text-muted">
                Website Care could not verify this WordPress connection. It may need to be reconnected.
              </p>
            )}

            {wordpressConnection.connected && wordpressConnection.connectionValid && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">Permissions</p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {PERMISSION_ROWS.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <dt className="text-gray-600">{label}</dt>
                      <dd className={CAPABILITY_TEXT_CLASS[wordpressConnection.capabilities[key]]}>
                        {CAPABILITY_LABELS[wordpressConnection.capabilities[key]]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {wordpressConnection.connected ? (
              <DisconnectWordPressButton websiteId={website.id} />
            ) : (
              <ConnectWordPressButton websiteId={website.id} />
            )}
          </>
        )}
      </Card>

      <div className="mt-6">
        <RecentFixes websiteId={website.id} />
      </div>
    </Container>
  )
}
