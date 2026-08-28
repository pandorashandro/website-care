import Link from 'next/link'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import Card from '@/components/ui/card'
import { buttonStyles } from '@/components/ui/button'
import ScanWebsiteButton from '@/app/dashboard/scan-website-button'
import { healthLabel, healthTone } from '@/lib/scanner/health-label'

export type DashboardWebsite = {
  id: string
  name: string
  url: string
  created_at: string
}

export type DashboardLatestScan = {
  status: 'running' | 'completed' | 'failed'
  score: number | null
  created_at: string
}

const RING_COLOR_CLASS: Record<BadgeTone, string> = {
  success: 'border-green-500',
  warning: 'border-amber-500',
  danger: 'border-red-500',
  info: 'border-blue-500',
  neutral: 'border-border-strong',
  brand: 'border-brand',
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Every real state the dashboard can currently observe for a website:
 * never scanned (no scan row at all), a completed scan with a score, a scan
 * still running, a failed scan, and a defensive fallback for anything else
 * (e.g. a completed scan somehow missing its score) — handled safely rather
 * than assumed to be a normal completed report.
 */
export default function WebsiteCard({
  website,
  latestScan,
}: {
  website: DashboardWebsite
  latestScan?: DashboardLatestScan
}) {
  const isCompleteWithScore = latestScan?.status === 'completed' && latestScan.score !== null

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-gray-900">{website.name}</h3>
          <a
            href={website.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-sm text-muted hover:text-gray-700"
          >
            {hostnameOf(website.url)}
          </a>
        </div>

        {isCompleteWithScore && (
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 bg-surface ${RING_COLOR_CLASS[healthTone(latestScan!.score as number)]}`}
            aria-hidden="true"
          >
            <span className="text-base font-semibold text-gray-900">{latestScan!.score}</span>
          </div>
        )}
      </div>

      {isCompleteWithScore ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <Badge tone={healthTone(latestScan!.score as number)}>{healthLabel(latestScan!.score as number)}</Badge>
            <span className="text-xs text-subtle">Last scanned {formatDate(latestScan!.created_at)}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/dashboard/websites/${website.id}`}
              className={buttonStyles({ variant: 'outline', className: 'flex-1 text-center' })}
            >
              View Report
            </Link>
          </div>
          <ScanWebsiteButton websiteId={website.id} label="Scan Again" />
        </>
      ) : latestScan?.status === 'running' ? (
        <div className="mt-4 flex items-center justify-between">
          <Badge tone="info">Scanning…</Badge>
          <span className="text-xs text-subtle">This may take a moment</span>
        </div>
      ) : latestScan?.status === 'failed' ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <Badge tone="danger">Last scan failed</Badge>
            <span className="text-xs text-subtle">Added {formatDate(website.created_at)}</span>
          </div>
          <p className="mt-2 text-sm text-muted">Something went wrong during the last scan.</p>
          <ScanWebsiteButton websiteId={website.id} label="Retry Scan" />
        </>
      ) : latestScan ? (
        <>
          <div className="mt-4">
            <Badge tone="neutral">Status unknown</Badge>
          </div>
          <ScanWebsiteButton websiteId={website.id} label="Run Scan" />
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between">
            <Badge tone="neutral">Not scanned yet</Badge>
            <span className="text-xs text-subtle">Added {formatDate(website.created_at)}</span>
          </div>
          <p className="mt-2 text-sm text-muted">Run a scan to see your website&apos;s health report.</p>
          <ScanWebsiteButton websiteId={website.id} label="Run First Scan" />
        </>
      )}
    </Card>
  )
}
