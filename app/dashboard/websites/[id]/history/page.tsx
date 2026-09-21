import Link from 'next/link'
import { notFound } from 'next/navigation'
import { History as HistoryIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listScanHistoryWithHealth } from '../scan-history'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import ScoreMeter from '@/components/ui/score-meter'
import EmptyState from '@/components/ui/empty-state'
import WebsiteSubNav from '@/components/website/website-sub-nav'
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

  return (
    <Container size="xl" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <WebsiteSubNav websiteId={website.id} active="history" />

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{website.url}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Scan History</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Overall Health and pillar scores from this website&apos;s past scans.
          </p>
        </div>
        <Link href={`/dashboard/websites/${website.id}/integrations`} className="text-sm font-medium text-brand hover:text-brand-hover">
          Manage monitoring in Settings →
        </Link>
      </div>

      {scans.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No scans yet"
          description="Run a scan from the Overview tab to start building this website's history."
          className="mt-6"
        />
      ) : (
        <Card padding="none" className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-xs font-semibold uppercase tracking-wide text-subtle">
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
                <tr key={scan.crawlRunId} className="border-b border-border transition-colors duration-150 ease-out last:border-0 hover:bg-surface-muted">
                  <td className="whitespace-nowrap px-4 py-3.5 text-gray-900">
                    {scan.completedAt ? formatDate(scan.completedAt) : 'In progress'}
                    {scan.isPartial && (
                      <Badge tone="warning" className="ml-2">
                        Partial
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {scan.overallHealthScore === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <span className="w-20">
                          <ScoreMeter
                            score={scan.overallHealthScore}
                            size="sm"
                            aria-label={`Overall Website Health: ${scan.overallHealthScore} out of 100`}
                          />
                        </span>
                        <Badge tone={healthTone(scan.overallHealthScore)}>{scan.overallHealthScore}</Badge>
                      </div>
                    )}
                  </td>
                  {CANONICAL_PILLARS.map((pillar) => {
                    const score = scan.pillarScores[pillar]
                    return (
                      <td key={pillar} className="px-4 py-3.5">
                        {score === null || score === undefined ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <Badge tone={healthTone(score)}>{score}</Badge>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Container>
  )
}
