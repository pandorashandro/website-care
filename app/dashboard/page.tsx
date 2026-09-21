import type { Metadata } from 'next'
import { Globe2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedCategorySummaries } from './websites/[id]/unified-summary'
import { computeOverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import { deriveDashboardWebsiteStatus } from './dashboard-website-status'
import { needsAttention } from '@/lib/scanner/health-label'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import HealthGauge from '@/components/ui/health-gauge'
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

  return (
    <Container size="lg" className="py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Portfolio</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Your websites</h1>
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

          {/*
            Sprint 3, Prompt 2B (structural reset) — replaces four
            equal-weight KPI tiles (Websites / Scanned / Needs attention /
            Average health) with ONE consolidated band: a HealthGauge for
            the portfolio's own average health (the same signature shape
            used everywhere else health is shown), and a single, color-coded
            attention signal — because "needs attention" is the one number
            on this page that should visually dominate, not sit as a fourth
            identical gray box next to a raw website count.
          */}
          {scannedCount > 0 && (
            <Card padding="none" className="mt-8 overflow-hidden">
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <HealthGauge
                    score={averageScore}
                    size="md"
                    aria-label={averageScore === null ? 'Portfolio health: not yet available' : `Portfolio health: ${averageScore} out of 100`}
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Portfolio health</p>
                    <p className="mt-1 text-sm text-muted">
                      {scannedCount} of {websites.length} website{websites.length === 1 ? '' : 's'} scanned
                    </p>
                  </div>
                </div>

                {needsAttentionCount > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-danger-subtle px-4 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                    <span className="text-sm font-semibold text-danger">
                      {needsAttentionCount} website{needsAttentionCount === 1 ? '' : 's'} need{needsAttentionCount === 1 ? 's' : ''} attention
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-success-subtle px-4 py-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    <span className="text-sm font-semibold text-success">All scanned websites are healthy</span>
                  </div>
                )}
              </div>
            </Card>
          )}

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
