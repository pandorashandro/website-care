import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import HealthGauge from '@/components/ui/health-gauge'
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

/**
 * Sprint 3, Prompt 2B (structural reset) — reads the SAME canonical
 * Overall Website Health Website Overview itself shows, and triggers the
 * SAME canonical scan pipeline via ScanWebsiteControls — no second scoring
 * computation, no second scan entry point.
 *
 * Structurally rebuilt around `HealthGauge` (the same radial visual as
 * Website Overview's flagship metric and the pillar grid) instead of a
 * horizontal meter plus a separately printed score number — one glance at
 * the ring now tells a portfolio owner everything the previous stacked
 * text/badge/bar combination took four separate lines to say. Every real
 * state (analyzed, scanning, failed, never scanned) renders the same ring
 * shape, honestly empty when there is no score yet, so the whole portfolio
 * grid reads as one consistent visual system rather than "a meter for some
 * cards, nothing for others."
 */
export default function WebsiteCard({ website }: { website: DashboardWebsite }) {
  const { overallHealth } = website
  const score = website.status === 'analyzed' ? overallHealth.score : null

  return (
    <Card padding="none" className="flex h-full flex-col overflow-hidden transition-shadow duration-150 ease-out hover:shadow-md">
      <div className="flex items-start gap-4 p-5">
        <HealthGauge
          score={score}
          size="md"
          aria-label={score === null ? `${website.name}: not yet analyzed` : `${website.name}: ${score} out of 100`}
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-gray-900">{website.name}</h3>
          <a
            href={website.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-sm text-muted transition-colors duration-150 ease-out hover:text-gray-700"
          >
            {hostnameOf(website.url)}
          </a>

          <div className="mt-2.5">
            {website.status === 'analyzed' && score !== null ? (
              <>
                <Badge tone={healthTone(score)}>{healthLabel(score)}</Badge>
                {!website.allCategoriesAnalyzed && (
                  <p className="mt-1.5 text-xs text-subtle">
                    {overallHealth.contributingCategoryCount} of {overallHealth.totalCanonicalCategories} pillars
                  </p>
                )}
              </>
            ) : website.status === 'scanning' ? (
              <Badge tone="info">Scanning…</Badge>
            ) : website.status === 'failed' ? (
              <Badge tone="danger">Last scan failed</Badge>
            ) : (
              <Badge tone="neutral">Not scanned yet</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
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
