import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
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

function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-green-50 text-green-700'
  if (score >= 50) return 'bg-yellow-50 text-yellow-700'
  return 'bg-red-50 text-red-700'
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Your Websites</h1>
          <p className="mt-1 text-sm text-gray-500">
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
              <div
                key={website.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <h3 className="truncate font-medium text-gray-900">{website.name}</h3>
                <a
                  href={website.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-sm text-gray-500 hover:text-gray-700"
                >
                  {website.url}
                </a>

                <div className="mt-4 flex items-center justify-between">
                  {latestScan?.status === 'completed' && latestScan.score !== null ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${scoreBadgeClass(latestScan.score)}`}
                    >
                      Score: {latestScan.score}
                    </span>
                  ) : latestScan?.status === 'running' ? (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                      Scanning…
                    </span>
                  ) : latestScan?.status === 'failed' ? (
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
                      Last scan failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      Not scanned yet
                    </span>
                  )}

                  <span className="text-xs text-gray-400">
                    {latestScan
                      ? `Scanned ${formatDate(latestScan.created_at)}`
                      : `Added ${formatDate(website.created_at)}`}
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/dashboard/websites/${website.id}`}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View Report
                  </Link>
                </div>

                <ScanWebsiteButton websiteId={website.id} />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
          <h2 className="text-sm font-medium text-gray-900">No websites yet</h2>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            You haven&apos;t added any websites yet. Once you add one, it will show up here.
          </p>
        </div>
      )}
    </div>
  )
}
