import Link from 'next/link'
import { Globe2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import AddWebsiteButton from './add-website-button'
import ScanWebsiteButton from './scan-website-button'

type Website = {
  id: string
  name: string
  url: string
  created_at: string
}

type ScanSummary = {
  id: string
  website_id: string
  status: 'running' | 'completed' | 'failed'
  score: number | null
  created_at: string
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function scoreBadgeTone(score: number): BadgeTone {
  if (score >= 80) return 'success'
  if (score >= 50) return 'warning'
  return 'danger'
}

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
    .returns<Website[]>()

  const hasWebsites = (websites?.length ?? 0) > 0

  const latestScans = new Map<string, ScanSummary>()

  if (websites && websites.length > 0) {
    const { data: scans } = await supabase
      .from('scans')
      .select('id, website_id, status, score, created_at')
      .in(
        'website_id',
        websites.map((website) => website.id)
      )
      .order('created_at', { ascending: false })
      .returns<ScanSummary[]>()

    for (const scan of scans ?? []) {
      if (!latestScans.has(scan.website_id)) {
        latestScans.set(scan.website_id, scan)
      }
    }
  }

  return (
    <Container size="lg" className="py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Your Websites</h1>
          <p className="mt-1 text-sm text-muted">
            Keep track of the websites you manage and monitor their health in one place.
          </p>
        </div>

        <AddWebsiteButton />
      </div>

      {hasWebsites ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {websites!.map((website) => {
            const latestScan = latestScans.get(website.id)

            return (
              <Card key={website.id} padding="md">
                <h3 className="truncate font-medium text-gray-900">{website.name}</h3>
                <a
                  href={website.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-sm text-muted hover:text-gray-700"
                >
                  {website.url}
                </a>

                <div className="mt-4 flex items-center justify-between">
                  {latestScan?.status === 'completed' && latestScan.score !== null ? (
                    <Badge tone={scoreBadgeTone(latestScan.score)}>Score: {latestScan.score}</Badge>
                  ) : latestScan?.status === 'running' ? (
                    <Badge tone="info">Scanning…</Badge>
                  ) : latestScan?.status === 'failed' ? (
                    <Badge tone="danger">Last scan failed</Badge>
                  ) : (
                    <Badge tone="neutral">Not scanned yet</Badge>
                  )}

                  <span className="text-xs text-subtle">
                    {latestScan
                      ? `Scanned ${formatDate(latestScan.created_at)}`
                      : `Added ${formatDate(website.created_at)}`}
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/dashboard/websites/${website.id}`}
                    className={buttonStyles({ variant: 'outline', size: 'md', className: 'flex-1 text-center' })}
                  >
                    View Report
                  </Link>
                </div>

                <ScanWebsiteButton websiteId={website.id} />
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={Globe2}
          title="No websites yet"
          description="You haven't added any websites yet. Once you add one, it will show up here."
          className="mt-8"
        />
      )}
    </Container>
  )
}
