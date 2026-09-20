import Link from 'next/link'
import { notFound } from 'next/navigation'
import { History as HistoryIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listScanHistoryWithHealth } from '../scan-history'
import { getMonitoringSettings } from '../monitoring-settings'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import MonitoringSettingsForm from '@/components/monitoring/monitoring-settings-form'
import { formatDate } from '@/components/report/report-helpers'
import { healthTone } from '@/lib/scanner/health-label'
import { CANONICAL_PILLARS, CANONICAL_PILLAR_LABELS } from '@/lib/monitoring/types'

type Website = { id: string; name: string; url: string }

const HISTORY_LIMIT = 10

/**
 * Sprint 2, Prompt 1 — MONITORING FOUNDATION, Step 10. A minimal scan
 * timeline, never a general-purpose analytics dashboard: this website's own
 * most recent completed/partial scans, each with its Overall Health and 7
 * pillar scores at that point in time — enough to understand the change
 * between any two consecutive completed scans, nothing more.
 */
export default async function WebsiteHistoryPage(props: PageProps<'/dashboard/websites/[id]/history'>) {
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

  const scans = await listScanHistoryWithHealth(website.id, HISTORY_LIMIT)
  const monitoringSettings = await getMonitoringSettings(website.id)
  const entitlements = await getCurrentUserEntitlements()

  return (
    <Container size="lg" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <WebsiteSubNav websiteId={website.id} active="history" />

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{website.url}</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Scan History</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Overall Health and pillar scores from this website&apos;s past scans.
        </p>
      </div>

      {monitoringSettings && (
        <Card padding="md" className="mt-6">
          <MonitoringSettingsForm websiteId={website.id} initialSettings={monitoringSettings} grantedCadence={entitlements.monitoringCadence} />
        </Card>
      )}

      {scans.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No scans yet"
          description="Run a scan from the Overview tab to start building this website's history."
          className="mt-6"
        />
      ) : (
        <Card padding="none" className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-subtle">
                <th className="px-4 py-3">Scan</th>
                <th className="px-4 py-3">Overall Health</th>
                {CANONICAL_PILLARS.map((pillar) => (
                  <th key={pillar} className="px-4 py-3">
                    {CANONICAL_PILLAR_LABELS[pillar]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.crawlRunId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-gray-900">
                    {scan.completedAt ? formatDate(scan.completedAt) : 'In progress'}
                    {scan.isPartial && (
                      <Badge tone="warning" className="ml-2">
                        Partial
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {scan.overallHealthScore === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Badge tone={healthTone(scan.overallHealthScore)}>{scan.overallHealthScore}</Badge>
                    )}
                  </td>
                  {CANONICAL_PILLARS.map((pillar) => (
                    <td key={pillar} className="px-4 py-3 text-gray-700">
                      {scan.pillarScores[pillar] ?? <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Container>
  )
}
