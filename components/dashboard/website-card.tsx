import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import ScoreMeter from '@/components/ui/score-meter'
import { buttonStyles } from '@/components/ui/button'
import ScanWebsiteControls from '@/app/dashboard/websites/[id]/scan-website-controls'
import { healthLabel, healthTone } from '@/lib/scanner/health-label'
import type { OverallWebsiteHealth } from '@/lib/category-engine/overall-health'

export type DashboardWebsiteStatus = 'analyzed' | 'scanning' | 'failed' | 'not_scanned'

export type DashboardWebsite = {
  id: string
  name: string
  url: string
  createdAt: string
  overallHealth: OverallWebsiteHealth
  crawlRun: { id: string; status: string } | null
  allCategoriesAnalyzed: boolean
  lastAnalyzedAt: string | null
  status: DashboardWebsiteStatus
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Sprint 3, Prompt 2B — reads the SAME canonical Overall Website Health
 * Website Overview itself shows (see app/dashboard/page.tsx's own doc
 * comment) and triggers the SAME canonical scan pipeline via
 * ScanWebsiteControls — no second scoring computation, no second scan
 * entry point. Visually redesigned: the health meter now uses the shared
 * ScoreMeter (the same signature visualization as Overview/pillars), and
 * every real state (analyzed, scanning, failed, never scanned) gets its
 * own honest presentation rather than a single "score or nothing" branch.
 */
export default function WebsiteCard({ website }: { website: DashboardWebsite }) {
  const { overallHealth } = website

  return (
    <Card padding="md" className="flex flex-col transition-shadow duration-150 ease-out hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">{website.name}</h3>
          <a
            href={website.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-sm text-muted transition-colors duration-150 ease-out hover:text-gray-700"
          >
            {hostnameOf(website.url)}
          </a>
        </div>

        {website.status === 'analyzed' && overallHealth.score !== null && (
          <span className="shrink-0 text-2xl font-semibold tabular-nums text-gray-900">{overallHealth.score}</span>
        )}
      </div>

      {website.status === 'analyzed' && overallHealth.score !== null ? (
        <>
          <ScoreMeter
            score={overallHealth.score}
            size="sm"
            className="mt-3"
            aria-label={`Overall Website Health: ${overallHealth.score} out of 100, ${healthLabel(overallHealth.score)}`}
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <Badge tone={healthTone(overallHealth.score)}>{healthLabel(overallHealth.score)}</Badge>
            <span className="text-xs text-subtle">{website.lastAnalyzedAt ? `Analyzed ${formatDate(website.lastAnalyzedAt)}` : null}</span>
          </div>
          {!website.allCategoriesAnalyzed && (
            <p className="mt-1.5 text-xs text-subtle">
              Based on {overallHealth.contributingCategoryCount} of {overallHealth.totalCanonicalCategories} pillars analyzed so far.
            </p>
          )}
        </>
      ) : website.status === 'scanning' ? (
        <div className="mt-4 flex items-center justify-between">
          <Badge tone="info">Scanning…</Badge>
          <span className="text-xs text-subtle">This may take a moment</span>
        </div>
      ) : website.status === 'failed' ? (
        <div className="mt-4">
          <Badge tone="danger">Last scan failed</Badge>
          <p className="mt-2 text-sm text-muted">Something went wrong during the last scan.</p>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between">
          <Badge tone="neutral">Not scanned yet</Badge>
          <span className="text-xs text-subtle">Added {formatDate(website.createdAt)}</span>
        </div>
      )}

      <div className="mt-4 flex flex-1 flex-col justify-end gap-2">
        {website.status === 'analyzed' && (
          <Link href={`/dashboard/websites/${website.id}`} className={buttonStyles({ variant: 'outline', className: 'text-center' })}>
            View report
          </Link>
        )}
        <ScanWebsiteControls websiteId={website.id} crawlRun={website.crawlRun} allCategoriesAnalyzed={website.allCategoriesAnalyzed} />
      </div>
    </Card>
  )
}
