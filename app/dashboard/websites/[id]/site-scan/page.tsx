import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Radar } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import { formatDate } from '@/components/report/report-helpers'
import SiteScanControls, { type SiteScanRun } from './site-scan-controls'
import type { CrawlRunStatus } from '@/lib/crawler/types'

/**
 * Phase 25B — the minimal product surface for Phase 25's site-wide crawler.
 * Deliberately its own sub-nav tab ("Site Scan"), not a replacement for the
 * existing Overview page's "Scan Again" button: that button still runs the
 * pre-existing, unrelated single-request scanner (lib/scanner/crawl-website.ts,
 * capped at 20 pages, producing the `scans`/`issues` tables the Overview
 * report reads) — see docs/entitlements.md-style boundary note in
 * lib/crawler/engine.ts's own module comment. This page reads/writes only
 * the NEW crawl_runs/crawl_pages/crawl_links tables and never touches
 * `scans`/`issues`, so neither system can regress the other.
 *
 * No crawler-internal vocabulary is surfaced here (no "frontier", "claim",
 * "stale reclaim", etc.) — only the plain product concepts Checkpoint 5
 * calls for: a status, a handful of counts, a page limit, and one action
 * button (see site-scan-controls.tsx).
 */

type Website = { id: string; name: string; url: string }

const STATUS_LABELS: Record<CrawlRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  partial: 'Completed (page limit reached)',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const STATUS_TONES: Record<CrawlRunStatus, BadgeTone> = {
  queued: 'neutral',
  running: 'info',
  completed: 'success',
  partial: 'success',
  failed: 'danger',
  cancelled: 'neutral',
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  )
}

export default async function WebsiteSiteScanPage(props: PageProps<'/dashboard/websites/[id]/site-scan'>) {
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

  // Kicked off early so it runs concurrently with the crawl_runs query below.
  const entitlementsPromise = getCurrentUserEntitlements()

  // RLS's own crawl_runs_select_own policy (joins through websites.user_id)
  // is the actual enforcement here — this ownership-scoped query is the
  // fast common-case path, not the only guarantee, mirroring every other
  // read on this page.
  const { data: crawlRun } = await supabase
    .from('crawl_runs')
    .select(
      'id, status, effective_page_budget, pages_discovered, pages_processed, pages_succeeded, pages_failed, pages_skipped, created_at, started_at, completed_at'
    )
    .eq('website_id', website.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<SiteScanRun>()

  const entitlements = await entitlementsPromise
  const lastCrawlTime = crawlRun?.completed_at ?? crawlRun?.started_at ?? crawlRun?.created_at ?? null
  const progressPercent = crawlRun ? Math.min(100, Math.round((crawlRun.pages_processed / crawlRun.effective_page_budget) * 100)) : 0

  return (
    <Container size="md" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <Card padding="md" className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Site Scan</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Site-wide crawl</h1>
          <p className="mt-1 text-sm text-muted">
            Discovers pages across your website and checks up to{' '}
            {crawlRun?.effective_page_budget ?? entitlements.maxCrawlPages} pages.
          </p>

          {crawlRun && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONES[crawlRun.status]}>{STATUS_LABELS[crawlRun.status]}</Badge>
              {lastCrawlTime && <span className="text-sm text-muted">Last run {formatDate(lastCrawlTime)}</span>}
            </div>
          )}
        </div>

        <div className="sm:w-56 sm:shrink-0">
          <SiteScanControls websiteId={website.id} run={crawlRun ?? null} />
        </div>
      </Card>

      <WebsiteSubNav websiteId={website.id} active="site-scan" />

      {!crawlRun ? (
        <EmptyState
          icon={Radar}
          title="Your website hasn't had a site scan yet."
          description="A site scan discovers pages across your website via links and your sitemap, and records what it finds — separate from your regular website health scan."
          className="mt-6"
        />
      ) : (
        <Card padding="md" className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Progress</h2>

          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBlock label="Discovered" value={crawlRun.pages_discovered} />
            <StatBlock label="Processed" value={crawlRun.pages_processed} />
            <StatBlock label="Succeeded" value={crawlRun.pages_succeeded} />
            <StatBlock label="Failed" value={crawlRun.pages_failed} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Crawl page limit: {crawlRun.effective_page_budget}</span>
              <span>
                {crawlRun.pages_processed} of {crawlRun.effective_page_budget} pages
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-brand" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </Card>
      )}
    </Container>
  )
}
