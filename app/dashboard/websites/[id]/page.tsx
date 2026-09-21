import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ScanSearch } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { aggregateIssues, type RawIssueRow } from '@/lib/scanner/aggregate-issues'
import { calculateHealthScore } from '@/lib/scanner/calculate-health-score'
import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import { detectWordPress } from '@/lib/integrations/wordpress/detect-wordpress'
import { getWordPressConnectionSummary, toIntegrationFixabilityInputs } from './wordpress-capabilities'
import { getShopifyConnectionStatus, toShopifyIssueFixabilityInputs } from './shopify-connection-status'
import { getWixConnectionStatus, toWixIssueFixabilityInputs } from './wix-connection-status'
import { evaluateFixability, type FixabilityResult } from '@/lib/fixes/fixability'
import { evaluateShopifyIssueFixability } from '@/lib/integrations/shopify/issue-fixability'
import { evaluateWixIssueFixability } from '@/lib/integrations/wix/issue-fixability'
import RecentFixes from './recent-fixes'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import HealthOverview from '@/components/report/health-overview'
import HealthGauge from '@/components/ui/health-gauge'
import CategoryScoreGrid from '@/components/report/category-score-grid'
import { healthLabel, healthTone } from '@/lib/scanner/health-label'
import ScanWebsiteControls from './scan-website-controls'
import { getUnifiedCategorySummaries } from './unified-summary'
import { getFixTheseFirst } from './fix-these-first'
import { getLatestChangeSummary } from './scan-history'
import SinceLastScan from '@/components/report/since-last-scan'
import { getMonitoringSettings } from './monitoring-settings'
import MonitoringStatus from '@/components/monitoring/monitoring-status'
import { latestNotificationForWebsite } from '@/lib/monitoring/notification-service'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import { computeOverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import FixTheseFirst from '@/components/report/fix-these-first'
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

  // All four kicked off early so they run concurrently with the Supabase
  // queries below rather than adding their network latency on top of them.
  // None is persisted (no schema change) — all are recomputed live on every
  // report render. getWordPressConnectionSummary/getShopifyConnectionStatus/
  // getWixConnectionStatus each independently re-verify session + ownership
  // themselves; none trusts this page's earlier check.
  const wordpressPromise = detectWordPress(website.url)
  const wordpressConnectionPromise = getWordPressConnectionSummary(website.id)
  const shopifyConnectionPromise = getShopifyConnectionStatus(website.id)
  const wixConnectionPromise = getWixConnectionStatus(website.id)

  // Unified webioom engine — the ONE server-side retrieval of every
  // canonical category's authoritative analysis, all resolved from the SAME
  // latest crawl_run (see unified-summary.ts's own doc comment for why this
  // replaced four independent per-category fetches). No category's score is
  // ever computed on this page — each is read verbatim from its own
  // canonical crawl_analyses row, exactly as its dedicated page reads it.
  const unifiedSummariesPromise = getUnifiedCategorySummaries(website.id)

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

  const { crawlRun, technicalSeo, onPageSeo, siteArchitecture, content, performance, accessibility, security } = await unifiedSummariesPromise

  // Unified webioom engine, Prompt 2 — all SEVEN canonical categories now
  // contribute to Overall Website Health (Performance/Accessibility/
  // Security joined Technical SEO/On-Page SEO/Site Architecture/Content).
  const canonicalSummaries = [technicalSeo, onPageSeo, siteArchitecture, content, performance, accessibility, security]
  const overallHealth = computeOverallWebsiteHealth(canonicalSummaries)
  const allCategoriesAnalyzed = canonicalSummaries.every((summary) => summary.status === 'analyzed')

  // "Latest website-analysis date" for the header card: the most recent
  // canonical category's own analyzedAt timestamp (all seven are analyzed
  // together by the same unified scan, so they are always very close in
  // time) — never the legacy homepage scan's date, which is a separate,
  // independently-timed analysis.
  const latestAnalysisDate = canonicalSummaries
    .map((summary) => summary.analyzedAt)
    .filter((date): date is string => !!date)
    .sort()
    .at(-1)

  // Overview command center: a small, deterministic cross-category "Fix
  // these first" list — see fix-these-first.ts's own doc comment. Only
  // fetched once a crawl_run exists to key off; resolves to [] for a
  // crawl_run with no analyzed categories yet.
  const fixTheseFirst = crawlRun ? await getFixTheseFirst(website.id, crawlRun.id) : []

  // Sprint 2, Prompt 1 — MONITORING FOUNDATION, Step 9. Re-derives its own
  // ownership-checked scan history rather than reusing crawlRun/unifiedSummariesPromise
  // above (those reflect only the LATEST scan; this needs the current/previous PAIR).
  const latestChange = await getLatestChangeSummary(website.id)
  const monitoringSettings = await getMonitoringSettings(website.id)
  const entitlements = await getCurrentUserEntitlements()
  const latestNotification = monitoringSettings?.monitoringEnabled ? await latestNotificationForWebsite(website.id) : null

  const wordpress = await wordpressPromise
  const wordpressConnection = await wordpressConnectionPromise
  const shopifyConnection = await shopifyConnectionPromise
  const wixConnection = await wixConnectionPromise

  // Centralizes fixability evaluation — pure, deterministic, and does not
  // affect priority ranking or health scoring, which are computed
  // independently above. Phase 19.4: the WordPress-specific connection
  // summary is translated to fixability's generic inputs via the thin
  // wordpress-capabilities.ts mapper — evaluateFixability itself no longer
  // knows anything WordPress-specific.
  const { connectionState, capabilities } = toIntegrationFixabilityInputs(wordpressConnection)
  const shopifyFixabilityInputs = toShopifyIssueFixabilityInputs(shopifyConnection)
  const wixFixabilityInputs = toWixIssueFixabilityInputs(wixConnection)

  /**
   * Phase 20.1H (Shopify) / Wix V1 Prompt 3: WordPress's own
   * evaluateFixability result is computed first and completely untouched —
   * when it already resolves 'assisted', it is returned exactly as-is, with
   * fixProvider 'wordpress', so every existing WordPress-connected
   * website's report renders byte-for-byte the same as before either
   * platform existed. Only when WordPress does NOT offer an assisted fix
   * does Shopify get a chance, then Wix — and both
   * evaluateShopifyIssueFixability and evaluateWixIssueFixability return
   * null for every issue type they have no opinion on (H1, Image Alt,
   * everything else), so those always keep WordPress's own reasoning
   * regardless of whether Shopify or Wix is connected.
   */
  function getFixability(issueTitle: string): { fixability: FixabilityResult; fixProvider: 'wordpress' | 'shopify' | 'wix' | null } {
    const wordpressResult = evaluateFixability({
      issueTitle,
      integrationDetected: wordpress.status !== 'unknown',
      connectionState,
      capabilities,
    })

    if (wordpressResult.level === 'assisted') {
      return { fixability: wordpressResult, fixProvider: 'wordpress' }
    }

    const shopifyResult = evaluateShopifyIssueFixability({
      issueTitle,
      connectionState: shopifyFixabilityInputs.connectionState,
      grantedScopes: shopifyFixabilityInputs.grantedScopes,
    })

    if (shopifyResult && shopifyResult.level === 'assisted') {
      return { fixability: shopifyResult, fixProvider: 'shopify' }
    }

    const wixResult = evaluateWixIssueFixability({
      issueTitle,
      connectionState: wixFixabilityInputs.connectionState,
    })

    if (wixResult && wixResult.level === 'assisted') {
      return { fixability: wixResult, fixProvider: 'wix' }
    }

    // No platform can currently assist. Prefer whichever CONNECTED
    // platform's reasoning is most relevant to this merchant — but only
    // for the title/meta_description issues that platform has an opinion
    // on at all (both results are null otherwise, e.g. H1/Image Alt), and
    // only when that platform is connected/needs_attention, never when
    // it's simply not_connected (which would otherwise change existing
    // WordPress-only websites' wording for no reason).
    if (shopifyResult && shopifyFixabilityInputs.connectionState !== 'not_connected') {
      return { fixability: shopifyResult, fixProvider: null }
    }
    if (wixResult && wixFixabilityInputs.connectionState !== 'not_connected') {
      return { fixability: wixResult, fixProvider: null }
    }

    return { fixability: wordpressResult, fixProvider: null }
  }

  // (pageUrl -> earliest matching raw issue id) per issue title, used only
  // to give Shopify's/Wix's Prepare-Fix flow the trusted issueId it
  // requires (unlike WordPress's title/meta fix, which resolves purely
  // from pageUrl — see shopify-title-issue.ts/wix-title-issue.ts). Built
  // the same way missingImageAltInstances already derives per-instance
  // identity aggregateIssues itself throws away.
  const firstIssueIdByTitleAndPage = new Map<string, string>()
  for (const raw of issues) {
    const key = `${raw.title}|${raw.page_url ?? website.url}`
    if (!firstIssueIdByTitleAndPage.has(key)) {
      firstIssueIdByTitleAndPage.set(key, raw.id)
    }
  }

  // Decorated once, server-side, with a stable anchor id (so "Needs your
  // attention" can link straight to a card below), its fixability result,
  // which platform (if any) is offering that result, and — only when
  // Shopify or Wix is the provider — the trusted issue id that platform's
  // Prepare-Fix flow requires. Neither aggregateIssues nor
  // evaluateFixability is changed by this.
  const decoratedIssues: DecoratedIssue[] = aggregatedIssues.map((issue, index) => {
    const { fixability, fixProvider } = getFixability(issue.title)
    const trustedIssueId =
      (fixProvider === 'shopify' || fixProvider === 'wix') && issue.affectedPageUrls[0]
        ? firstIssueIdByTitleAndPage.get(`${issue.title}|${issue.affectedPageUrls[0]}`)
        : undefined
    const shopifyIssueId = fixProvider === 'shopify' ? trustedIssueId : undefined
    const wixIssueId = fixProvider === 'wix' ? trustedIssueId : undefined

    return {
      ...issue,
      anchorId: `issue-${index}`,
      fixability,
      fixProvider,
      shopifyIssueId,
      wixIssueId,
    }
  })

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
    <Container size="2xl" className="py-10">
      <Link href="/dashboard" className="text-sm text-muted hover:text-gray-700">
        ← Back to Websites
      </Link>

      {/*
        Sprint 3, Prompt 2B (structural reset) — identity, scan action, and
        Overall Website Health used to be two stacked plain-white Cards
        (a header Card, then a separate OverallWebsiteHealthCard). The
        founder's own grayscale/no-logo test made the problem obvious: two
        identical white boxes stacked vertically is indistinguishable from
        the previous design no matter what color is used inside them. This
        is now ONE bold hero band with a tinted brand-gradient wash and the
        HealthGauge as its focal shape — the single biggest visual-identity
        moment on the page, exactly matching "the founder should remember
        this component."
      */}
      <div className="relative mt-4 overflow-hidden rounded-xl border border-border">
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Website Overview</p>
            <h1 className="mt-1 truncate text-3xl font-bold tracking-tight text-gray-900">{website.name}</h1>
            <a href={website.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm text-muted hover:text-gray-700">
              {website.url}
            </a>

            <p className="mt-3 text-sm text-muted">
              {latestAnalysisDate
                ? `Last analyzed ${formatDate(latestAnalysisDate)}`
                : crawlRun && (crawlRun.status === 'queued' || crawlRun.status === 'running')
                  ? 'Scanning in progress…'
                  : 'Not scanned yet'}
            </p>

            {monitoringSettings && <MonitoringStatus settings={monitoringSettings} grantedCadence={entitlements.monitoringCadence} latestNotification={latestNotification} />}

            <div className="mt-5 sm:w-56">
              <ScanWebsiteControls websiteId={website.id} crawlRun={crawlRun} allCategoriesAnalyzed={allCategoriesAnalyzed} />
            </div>
          </div>

          {(crawlRun || latestScan) && (
            <div className="flex items-center gap-5 border-t border-border pt-6 lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
              <HealthGauge
                score={overallHealth.score}
                size="lg"
                aria-label={overallHealth.score === null ? 'Overall Website Health: not yet available' : `Overall Website Health: ${overallHealth.score} out of 100`}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Overall Health</p>
                {overallHealth.score === null ? (
                  <p className="mt-1 text-sm text-muted">Run a scan to see this.</p>
                ) : (
                  <>
                    <Badge tone={healthTone(overallHealth.score)} className="mt-1">
                      {healthLabel(overallHealth.score)}
                    </Badge>
                    <p className="mt-2 text-xs text-muted">
                      {overallHealth.contributingCategoryCount} of {overallHealth.totalCanonicalCategories} pillars analyzed
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <WebsiteSubNav websiteId={website.id} active="overview" />

      {!crawlRun && !latestScan && (
        <EmptyState
          icon={ScanSearch}
          title="Your website is ready for its first scan."
          description="Scan your website to see its health across Technical SEO, On-Page SEO, Content, Site Architecture, and more — organized by priority so you know what to fix first."
          action={<ScanWebsiteControls websiteId={website.id} crawlRun={crawlRun} allCategoriesAnalyzed={allCategoriesAnalyzed} />}
          className="mt-6"
        />
      )}

      {(crawlRun || latestScan) && (
        <div className="mt-6 space-y-6">
          <SinceLastScan result={latestChange} />

          <FixTheseFirst problems={fixTheseFirst} />

          <CategoryScoreGrid
            websiteId={website.id}
            technicalSeo={technicalSeo}
            siteArchitecture={siteArchitecture}
            onPageSeo={onPageSeo}
            content={content}
            performance={performance}
            accessibility={accessibility}
            security={security}
          />
        </div>
      )}

      {latestScan?.status === 'failed' && (
        <Alert tone="danger" className="mt-6">
          The last homepage scan failed. Try scanning again above.
        </Alert>
      )}

      {/*
        Sprint 3, Prompt 2B (structural reset) — this legacy single-page
        scan report (HealthOverview/PriorityIssues/IssueGroup, predating the
        seven-pillar canonical engine) used to render UNCONDITIONALLY
        whenever `latestScan` existed — including alongside the canonical
        widgets above, for any website that happened to have both a new
        crawl AND an old scan row. That produced exactly the duplicate,
        redundant "two reports on one page" experience the founder flagged.
        It now renders ONLY as a fallback for a website that has never had
        a canonical crawl at all (`!crawlRun`) — never stacked underneath
        the real canonical report. No data-fetching or computation above
        changed; this is a rendering-condition fix, not a backend change.
      */}
      {!crawlRun && latestScan?.status === 'completed' && healthScore && (
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Integrations</h2>

          <Link
            href={`/dashboard/websites/${website.id}/integrations`}
            className={buttonStyles({ variant: 'outline', size: 'sm' })}
          >
            Manage Integrations
          </Link>
        </div>

        <div className="mt-3 space-y-2">
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

          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">Shopify</span>
            {!shopifyConnection.connected ? (
              <Badge tone="neutral">Not connected</Badge>
            ) : shopifyConnection.connectionValid ? (
              <Badge tone="success">Connected</Badge>
            ) : (
              <Badge tone="warning">Needs attention</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">Wix</span>
            {!wixConnection.connected ? (
              <Badge tone="neutral">Not connected</Badge>
            ) : wixConnection.connectionValid ? (
              <Badge tone="success">Connected</Badge>
            ) : (
              <Badge tone="warning">Needs attention</Badge>
            )}
          </div>
        </div>

        <p className="mt-3 text-sm text-muted">
          {(wordpressConnection.connected && wordpressConnection.connectionValid) ||
          (shopifyConnection.connected && shopifyConnection.connectionValid) ||
          (wixConnection.connected && wixConnection.connectionValid)
            ? 'webioom can use your connected integration for supported fix workflows.'
            : (wordpressConnection.connected && !wordpressConnection.connectionValid) ||
                (shopifyConnection.connected && !shopifyConnection.connectionValid) ||
                (wixConnection.connected && !wixConnection.connectionValid)
              ? 'A connection needs attention before webioom can use it.'
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
