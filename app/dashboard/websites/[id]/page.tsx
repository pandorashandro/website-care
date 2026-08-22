import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ScanWebsiteButton from '@/app/dashboard/scan-website-button'
import { aggregateIssues, type RawIssueRow } from '@/lib/scanner/aggregate-issues'
import { calculateHealthScore, type Category } from '@/lib/scanner/calculate-health-score'
import { detectWordPress } from '@/lib/integrations/wordpress/detect-wordpress'

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

const SEVERITY_DISPLAY_ORDER = ['critical', 'high', 'medium', 'low'] as const

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const SEVERITY_BADGE_CLASS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: 'Technical',
  seo: 'SEO',
  accessibility: 'Accessibility',
  performance: 'Performance',
  content: 'Content',
}

const CATEGORY_ORDER: Category[] = ['seo', 'technical', 'accessibility', 'performance', 'content']

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  Urgent: 'bg-red-100 text-red-700',
  'High Priority': 'bg-orange-100 text-orange-700',
  'Medium Priority': 'bg-yellow-100 text-yellow-700',
  'Low Priority': 'bg-gray-100 text-gray-600',
}

const PRIORITY_BORDER_CLASS: Record<string, string> = {
  Urgent: 'border-l-red-500',
  'High Priority': 'border-l-orange-500',
  'Medium Priority': 'border-l-yellow-500',
  'Low Priority': 'border-l-gray-300',
}

const MAX_VISIBLE_AFFECTED_PAGES = 5
const TOP_ISSUE_COUNT = 3

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function healthLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Needs Attention'
  return 'Poor'
}

function healthBadgeClass(score: number): string {
  if (score >= 90) return 'bg-green-50 text-green-700'
  if (score >= 75) return 'bg-emerald-50 text-emerald-700'
  if (score >= 50) return 'bg-yellow-50 text-yellow-700'
  return 'bg-red-50 text-red-700'
}

function progressBarClass(score: number): string {
  if (score >= 90) return 'bg-green-500'
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function formatCategory(type: string): string {
  return CATEGORY_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1)
}

/**
 * Older issue rows may have page_url = null (created before that column
 * existed), so this must degrade gracefully rather than throw.
 */
function formatPageLabel(pageUrl: string | null): string {
  if (!pageUrl) return 'Homepage'

  try {
    const { pathname, search } = new URL(pageUrl)
    const path = `${pathname}${search}`
    return path === '' || path === '/' ? 'Homepage' : path
  } catch {
    return pageUrl
  }
}

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

  // Kicked off early so it runs concurrently with the Supabase queries below
  // rather than adding its ~2-request network latency on top of them. Not
  // persisted anywhere (no schema change this phase) — recomputed live on
  // every report render.
  const wordpressPromise = detectWordPress(website.url)

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
      .select('id, page_url, type, severity, title, description, recommendation')
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
  // exact page count — labeled accordingly below rather than as "scanned."
  const pageUrlsWithIssues = new Set(
    issues.map((issue) => issue.page_url).filter((url): url is string => !!url)
  )

  const aggregatedIssues = aggregateIssues(issues, website.url)
  const topIssues = aggregatedIssues.slice(0, TOP_ISSUE_COUNT)

  // Always computed live from the latest scan's issues (never read from the
  // stored scans.score) so legacy scans — created before this scoring model
  // existed — display correctly without a database rewrite. For scans
  // created after this change, this matches what scanWebsite stored.
  const healthScore =
    latestScan?.status === 'completed' ? calculateHealthScore(issues, website.url) : null

  const wordpress = await wordpressPromise

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
        ← Back to Websites
      </Link>

      <div className="mt-4 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-gray-900">{website.name}</h1>
          <a
            href={website.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-sm text-gray-500 hover:text-gray-700"
          >
            {website.url}
          </a>

          {!latestScan ? (
            <p className="mt-4 text-sm text-gray-500">This website hasn&apos;t been scanned yet.</p>
          ) : latestScan.status === 'completed' && healthScore ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${healthBadgeClass(healthScore.overall)}`}
              >
                {healthScore.overall} · {healthLabel(healthScore.overall)}
              </span>
              <span className="text-sm text-gray-500">
                Scanned {formatDate(latestScan.created_at)}
              </span>
              <span className="text-sm text-gray-500">
                {issues.length} issue{issues.length === 1 ? '' : 's'} found
              </span>
              {pageUrlsWithIssues.size > 0 && (
                <span className="text-sm text-gray-500">
                  {pageUrlsWithIssues.size} page{pageUrlsWithIssues.size === 1 ? '' : 's'} with
                  issues
                </span>
              )}
            </div>
          ) : latestScan.status === 'running' ? (
            <p className="mt-4 text-sm text-blue-600">Scan in progress…</p>
          ) : (
            <p className="mt-4 text-sm text-red-600">The last scan failed. Try scanning again.</p>
          )}
        </div>

        <div className="sm:w-48 sm:shrink-0">
          <ScanWebsiteButton
            websiteId={website.id}
            label={latestScan ? 'Scan Again' : 'Scan Website'}
          />
        </div>
      </div>

      {healthScore && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Website Health</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-gray-900">{healthScore.overall}</span>
            <span className="text-sm text-gray-500">/ 100</span>
            <span
              className={`ml-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${healthBadgeClass(healthScore.overall)}`}
            >
              {healthLabel(healthScore.overall)}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {CATEGORY_ORDER.map((category) => {
              const score = healthScore.categories[category]
              return (
                <div key={category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">{CATEGORY_LABELS[category]}</span>
                    <span className="text-gray-500">
                      {score} / 100 · {healthLabel(score)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${progressBarClass(score)}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Platform</h2>

        {wordpress.status === 'unknown' ? (
          <p className="mt-2 text-sm text-gray-500">Not confirmed</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-gray-900">
                {wordpress.status === 'confirmed' ? 'WordPress' : 'WordPress likely'}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  wordpress.status === 'confirmed'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}
              >
                {wordpress.status === 'confirmed' ? 'Detected' : 'Likely'}
              </span>
            </div>

            {wordpress.status === 'likely' && (
              <p className="mt-1 text-sm text-gray-500">We found several WordPress signals.</p>
            )}

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">REST API</dt>
                <dd className="font-medium text-gray-900">
                  {wordpress.restApiAvailable ? 'Available' : 'Unavailable'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">Connection</dt>
                <dd className="font-medium text-gray-900">Not connected</dd>
              </div>
            </dl>

            <button
              type="button"
              disabled
              title="Coming in Phase 13.2"
              className="mt-4 w-full cursor-not-allowed rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400"
            >
              Connect WordPress (coming soon)
            </button>
          </>
        )}
      </div>

      {latestScan?.status === 'completed' && (
        <div className="mt-8">
          {issues.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <h2 className="text-sm font-medium text-gray-900">No issues found</h2>
              <p className="mt-1 text-sm text-gray-500">
                This website passed every check in its latest scan.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {SEVERITY_DISPLAY_ORDER.filter((severity) => severityCounts[severity] > 0).map(
                  (severity) => (
                    <span
                      key={severity}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${SEVERITY_BADGE_CLASS[severity]}`}
                    >
                      {severityCounts[severity]} {SEVERITY_LABELS[severity]}
                    </span>
                  )
                )}
              </div>

              <p className="mt-2 text-sm text-gray-500">
                {issues.length} total issue{issues.length === 1 ? '' : 's'} across{' '}
                {aggregatedIssues.length} unique issue type{aggregatedIssues.length === 1 ? '' : 's'}
              </p>

              {topIssues.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-base font-semibold text-gray-900">Fix These First</h2>
                  <div className="mt-3 space-y-3">
                    {topIssues.map((issue, index) => (
                      <div
                        key={`${issue.title}|${issue.type}|${issue.severity}`}
                        className={`flex gap-4 rounded-lg border border-l-4 border-gray-200 bg-white p-4 shadow-sm ${PRIORITY_BORDER_CLASS[issue.priorityLabel]}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">{issue.title}</h3>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASS[issue.priorityLabel]}`}
                            >
                              {issue.priorityLabel}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                            <span>{SEVERITY_LABELS[issue.severity] ?? issue.severity}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatCategory(issue.type)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {issue.affectedPageCount} page{issue.affectedPageCount === 1 ? '' : 's'}{' '}
                              affected
                            </span>
                            {issue.homepageAffected && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Includes homepage</span>
                              </>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-gray-700">{issue.recommendation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-3">
                {aggregatedIssues.map((issue) => (
                  <div
                    key={`${issue.title}|${issue.type}|${issue.severity}`}
                    className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          SEVERITY_BADGE_CLASS[issue.severity] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {formatCategory(issue.type)}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">
                        {issue.affectedPageCount} page{issue.affectedPageCount === 1 ? '' : 's'} affected
                      </span>
                      {issue.homepageAffected && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                          Homepage
                        </span>
                      )}
                    </div>

                    <h3 className="mt-3 text-sm font-semibold text-gray-900">{issue.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{issue.description}</p>

                    <p className="mt-3 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">Recommended: </span>
                      {issue.recommendation}
                    </p>

                    <div className="mt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Affected pages
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {issue.affectedPageUrls.slice(0, MAX_VISIBLE_AFFECTED_PAGES).map((pageUrl) => (
                          <li key={pageUrl} className="truncate font-mono text-xs text-gray-500">
                            {formatPageLabel(pageUrl)}
                          </li>
                        ))}
                      </ul>
                      {issue.affectedPageUrls.length > MAX_VISIBLE_AFFECTED_PAGES && (
                        <p className="mt-1 text-xs text-gray-400">
                          + {issue.affectedPageUrls.length - MAX_VISIBLE_AFFECTED_PAGES} more
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
