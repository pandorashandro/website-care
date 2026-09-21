import type { Metadata } from 'next'
import { Globe2, ScanSearch, AlertTriangle, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedCategorySummaries } from './websites/[id]/unified-summary'
import { computeOverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import { deriveDashboardWebsiteStatus } from './dashboard-website-status'
import { needsAttention } from '@/lib/scanner/health-label'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import WebsiteCard, { type DashboardWebsite } from '@/components/dashboard/website-card'
import GettingStartedGuide from '@/components/dashboard/getting-started-guide'
import AddWebsiteButton from './add-website-button'

export const metadata: Metadata = {
  title: 'Dashboard',
}

/**
 * Sprint 3, Prompt 2B — Section 9/38's explicit exception: the Dashboard
 * previously read the legacy single-page `scans` table for its summary
 * stats and per-website cards, while Website Overview already showed the
 * REAL canonical Overall Website Health for the exact same website — two
 * different numbers for "how healthy is my website," which is a genuine
 * trust problem, not a cosmetic one. Fixed by calling the SAME
 * `getUnifiedCategorySummaries` + `computeOverallWebsiteHealth` pair
 * Website Overview itself uses for every owned website — no new scoring
 * logic, no independent calculation, the identical canonical read path.
 * `ScanWebsiteControls` (the same canonical scan trigger Website Overview
 * uses) replaces the legacy `ScanWebsiteButton` for the same reason: one
 * canonical scan pipeline, one entry point, never a second competing "Scan"
 * action that only drives the old single-page scanner.
 */
export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: websiteRows } = await supabase
    .from('websites')
    .select('id, name, url, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .returns<{ id: string; name: string; url: string; created_at: string }[]>()

  const hasWebsites = (websiteRows?.length ?? 0) > 0

  // Ownership is already established above (scoped to user.id); each call
  // below re-derives its own canonical data for that one owned website,
  // exactly like Website Overview's own server component does — never a
  // second, independent scoring computation.
  const websites: DashboardWebsite[] = await Promise.all(
    (websiteRows ?? []).map(async (row) => {
      const summaries = await getUnifiedCategorySummaries(row.id)
      const canonicalSummaries = [
        summaries.technicalSeo,
        summaries.onPageSeo,
        summaries.siteArchitecture,
        summaries.content,
        summaries.performance,
        summaries.accessibility,
        summaries.security,
      ]
      const overallHealth = computeOverallWebsiteHealth(canonicalSummaries)
      const lastAnalyzedAt = canonicalSummaries.map((summary) => summary.analyzedAt).filter((date): date is string => !!date).sort().at(-1) ?? null
      const allCategoriesAnalyzed = canonicalSummaries.every((summary) => summary.status === 'analyzed')
      const status = deriveDashboardWebsiteStatus(summaries.crawlRun, overallHealth)

      return {
        id: row.id,
        name: row.name,
        url: row.url,
        createdAt: row.created_at,
        overallHealth,
        crawlRun: summaries.crawlRun,
        allCategoriesAnalyzed,
        lastAnalyzedAt,
        status,
      }
    })
  )

  const analyzed = websites.filter((website) => website.overallHealth.score !== null)
  const scannedCount = analyzed.length
  const needsAttentionCount = analyzed.filter((website) => needsAttention(website.overallHealth.score as number)).length
  const averageScore = analyzed.length > 0 ? Math.round(analyzed.reduce((sum, website) => sum + (website.overallHealth.score as number), 0) / analyzed.length) : null

  const summaryStats = [
    { icon: Globe2, label: 'Websites', value: websites.length },
    { icon: ScanSearch, label: 'Scanned', value: scannedCount },
    { icon: AlertTriangle, label: 'Needs attention', value: needsAttentionCount },
    ...(averageScore !== null ? [{ icon: BarChart3, label: 'Average health', value: averageScore }] : []),
  ]

  return (
    <Container size="lg" className="py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Portfolio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">Your websites</h1>
          <p className="mt-1.5 text-sm text-muted">
            See the latest health of your websites and open a report to see what needs attention.
          </p>
        </div>

        <AddWebsiteButton />
      </div>

      {hasWebsites ? (
        <>
          {scannedCount === 0 && (
            <div className="mt-8">
              <GettingStartedGuide hasWebsite={hasWebsites} hasCompletedScan={scannedCount > 0} />
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {summaryStats.map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.label} padding="sm">
                  <div className="flex items-center gap-2 text-muted">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="text-xs font-medium">{stat.label}</span>
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-gray-900">{stat.value}</p>
                </Card>
              )
            })}
          </div>

          <div className="mt-4 border-t border-border" />

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {websites.map((website) => (
              <WebsiteCard key={website.id} website={website} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Globe2}
          title="Welcome to webioom"
          description="Add your first website to see what needs attention."
          action={<AddWebsiteButton label="Add Your First Website" />}
          className="mt-8"
        >
          <div className="mx-auto mt-6 max-w-sm border-t border-border pt-6 text-left">
            <p className="text-sm text-muted">
              webioom will scan the site, organize findings into a health report, and help you understand
              what to work on first.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">What happens next</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-700">
              <li>Add your website</li>
              <li>Run a health scan</li>
              <li>Review your prioritized report</li>
            </ol>
          </div>
        </EmptyState>
      )}
    </Container>
  )
}
