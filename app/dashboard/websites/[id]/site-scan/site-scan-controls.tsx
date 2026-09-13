'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startWebsiteCrawl, continueWebsiteCrawl } from '../crawl-actions'
import type { CrawlRunStatus } from '@/lib/crawler/types'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

/**
 * Phase 25B — the one control that drives a site-wide crawl end to end.
 *
 * WHAT DRIVES CONTINUATION IN V1: this component itself, while it is
 * mounted. There is no background worker or cron in this codebase's actual
 * infrastructure (Next.js on Vercel + Supabase — see lib/crawler/engine.ts's
 * own module doc comment), so "keep calling processCrawlBatch until the
 * crawl reaches a terminal state" has to be driven by something that
 * actually exists — here, that is the browser tab: while a crawl is
 * queued/running, an effect below repeatedly calls the SAME server action
 * the visible button itself calls, each call doing one bounded (~8s)
 * chunk of work, until the crawl finishes or the tab is closed/navigated
 * away from. Because all crawl state lives in crawl_runs/crawl_pages (not
 * in this component), closing the tab mid-crawl never loses anything —
 * reopening this page later shows the crawl still `running`/`queued` and
 * this same effect picks it back up exactly where it left off (or the
 * visible "Continue Scan" button does, with one click, if the auto-loop's
 * own safety cap below was hit first).
 */

const AUTO_CONTINUE_CAP = 300 // generous margin above the ~100 calls a full 500-page Bloom Pro crawl needs at BATCH_SIZE=5/~8s
const AUTO_CONTINUE_DELAY_MS = 250

export type SiteScanRun = {
  id: string
  status: CrawlRunStatus
  effective_page_budget: number
  pages_discovered: number
  pages_processed: number
  pages_succeeded: number
  pages_failed: number
  pages_skipped: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

const ACTIVE_STATUSES = new Set<CrawlRunStatus>(['queued', 'running'])

function buttonLabel(run: SiteScanRun | null, pending: boolean): string {
  if (pending) return 'Scanning…'
  if (!run) return 'Start Site Scan'
  if (ACTIVE_STATUSES.has(run.status)) return 'Continue Scan'
  return 'Scan Again'
}

export default function SiteScanControls({ websiteId, run }: { websiteId: string; run: SiteScanRun | null }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoStalled, setAutoStalled] = useState(false)
  const pendingRef = useRef(false)

  async function runOneStep() {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError(null)

    try {
      if (!run || !ACTIVE_STATUSES.has(run.status)) {
        const result = await startWebsiteCrawl(websiteId)
        if (!result.ok) {
          setError(result.error)
          return
        }
      } else {
        const result = await continueWebsiteCrawl(websiteId, run.id)
        if (!result.ok) {
          setError(result.error)
          return
        }
      }
      router.refresh()
    } catch {
      // Fails safely: the crawl's own persisted state is untouched by a
      // failed request (nothing here writes anything client-side), so the
      // user can always just try again.
      setError('Something went wrong. Please try again.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  useEffect(() => {
    if (!run || !ACTIVE_STATUSES.has(run.status)) return
    const activeCrawlRunId = run.id

    let cancelled = false

    async function driveContinuation() {
      setAutoStalled(false)

      for (let i = 0; i < AUTO_CONTINUE_CAP; i++) {
        if (cancelled || pendingRef.current) return

        pendingRef.current = true
        setPending(true)
        setError(null)

        let outcomeDone = true
        try {
          const result = await continueWebsiteCrawl(websiteId, activeCrawlRunId)
          if (cancelled) return
          if (!result.ok) {
            setError(result.error)
            return
          }
          outcomeDone = result.outcome.done
        } catch {
          if (!cancelled) setError('Something went wrong while scanning. Click Continue Scan to keep going.')
          return
        } finally {
          pendingRef.current = false
          setPending(false)
        }

        if (cancelled) return
        router.refresh()
        if (outcomeDone) return

        await new Promise((resolve) => setTimeout(resolve, AUTO_CONTINUE_DELAY_MS))
      }

      if (!cancelled) setAutoStalled(true)
    }

    driveContinuation()

    return () => {
      cancelled = true
    }
    // run is a fresh object every server render; only its id/status actually
    // change what this effect should do, so those (not the object identity)
    // are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.status, websiteId, router])

  return (
    <div>
      <Button type="button" variant="outline" disabled={pending} className="w-full" onClick={runOneStep}>
        {buttonLabel(run, pending)}
      </Button>

      {autoStalled && !pending && !error && (
        <p className="mt-2 text-xs text-muted">Still scanning — click Continue Scan to keep going.</p>
      )}

      {error && (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  )
}
