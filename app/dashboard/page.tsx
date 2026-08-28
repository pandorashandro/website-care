import { Globe2, ScanSearch, AlertTriangle, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import WebsiteCard, { type DashboardWebsite, type DashboardLatestScan } from '@/components/dashboard/website-card'
import GettingStartedGuide from '@/components/dashboard/getting-started-guide'
import { needsAttention } from '@/lib/scanner/health-label'
import AddWebsiteButton from './add-website-button'

type ScanRow = DashboardLatestScan & { id: string; website_id: string }

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: websites } = await supabase
    .from('websites')
    .select('id, name, url, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .returns<DashboardWebsite[]>()

  const hasWebsites = (websites?.length ?? 0) > 0

  const latestScans = new Map<string, ScanRow>()

  if (websites && websites.length > 0) {
    const { data: scans } = await supabase
      .from('scans')
      .select('id, website_id, status, score, created_at')
      .in(
        'website_id',
        websites.map((website) => website.id)
      )
      .order('created_at', { ascending: false })
      .returns<ScanRow[]>()

    for (const scan of scans ?? []) {
      if (!latestScans.has(scan.website_id)) {
        latestScans.set(scan.website_id, scan)
      }
    }
  }

  // Derived entirely from data already loaded above — no additional queries.
  // Only counts what the existing scans/websites data can answer accurately.
  const scoredScans = Array.from(latestScans.values()).filter(
    (scan) => scan.status === 'completed' && scan.score !== null
  )
  const scannedCount = scoredScans.length
  const needsAttentionCount = scoredScans.filter((scan) => needsAttention(scan.score as number)).length
  const averageScore =
    scoredScans.length > 0
      ? Math.round(scoredScans.reduce((sum, scan) => sum + (scan.score as number), 0) / scoredScans.length)
      : null

  const summaryStats = [
    { icon: Globe2, label: 'Websites', value: websites?.length ?? 0 },
    { icon: ScanSearch, label: 'Scanned', value: scannedCount },
    { icon: AlertTriangle, label: 'Needs attention', value: needsAttentionCount },
    ...(averageScore !== null ? [{ icon: BarChart3, label: 'Average health', value: averageScore }] : []),
  ]

  return (
    <Container size="lg" className="py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Your Websites</h1>
          <p className="mt-1 text-sm text-muted">
            See the latest health of your websites and open a report to see what needs attention.
          </p>
        </div>

        <AddWebsiteButton />
      </div>

      {hasWebsites ? (
        <>
          {scannedCount === 0 && (
            <div className="mt-6">
              <GettingStartedGuide hasWebsite={hasWebsites} hasCompletedScan={scannedCount > 0} />
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {summaryStats.map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.label} padding="sm">
                  <div className="flex items-center gap-2 text-muted">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="text-xs font-medium">{stat.label}</span>
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold text-gray-900">{stat.value}</p>
                </Card>
              )
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {websites!.map((website) => (
              <WebsiteCard key={website.id} website={website} latestScan={latestScans.get(website.id)} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Globe2}
          title="Welcome to WEBIOOM"
          description="Add your first website to see what needs attention."
          action={<AddWebsiteButton label="Add Your First Website" />}
          className="mt-8"
        >
          <div className="mx-auto mt-6 max-w-sm border-t border-border pt-6 text-left">
            <p className="text-sm text-muted">
              WEBIOOM will scan the site, organize findings into a health report, and help you understand
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
