'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startUnifiedScan, continueUnifiedScan, runCategoryAnalyses } from './scan-actions'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

/**
 * Unified webioom engine — the ONE customer-facing "Scan Website" control.
 *
 * Replaces the old two-button model (Overview's legacy homepage-only "Scan
 * Again" + the separate Site Scan page's own crawl button) with a single
 * action that drives the FULL pipeline: start/resume the site-wide crawl ->
 * drive it to completion -> run every canonical category analyzer -> show
 * the customer the updated Overview. Internal analyzer names never appear —
 * only "Scanning website… / Analyzing categories… / Preparing results…".
 *
 * DRIVING THE CRAWL TO COMPLETION reuses the exact pattern
 * site-scan-controls.tsx already established (this codebase has no
 * background worker — see lib/crawler/engine.ts's own doc comment — so a
 * crawl only advances via repeated bounded calls while a browser tab stays
 * open): a loop of `continueUnifiedScan` calls, each doing one ~8s bounded
 * batch, until `outcome.done`. `pendingRef` (a ref, not state) prevents a
 * second click from starting a concurrent, duplicate pipeline while one is
 * already running — the crawl engine's own `findActiveCrawlRun` check is
 * the ultimate, server-side guarantee; this is the fast, common-case UI
 * guard on top of it.
 *
 * AUTO-RESUME ON MOUNT: if the page loads with a crawl already
 * queued/running (e.g. a previous tab was closed mid-scan) or with a
 * terminal crawl whose category analyses never completed (e.g. the browser
 * closed between crawl completion and the analyze step), this component
 * picks the pipeline back up automatically — the customer never has to
 * understand or manually retry the interruption.
 */

export type UnifiedScanRun = { id: string; status: string } | null

const ACTIVE_STATUSES = new Set(['queued', 'running'])
const ANALYZABLE_STATUSES = new Set(['completed', 'partial'])
const AUTO_CONTINUE_CAP = 300
const AUTO_CONTINUE_DELAY_MS = 250

type Phase = 'idle' | 'scanning' | 'analyzing' | 'preparing' | 'stalled'

const PHASE_LABELS: Partial<Record<Phase, string>> = {
  scanning: 'Scanning website…',
  analyzing: 'Analyzing categories…',
  preparing: 'Preparing results…',
}

type DriveResult = { done: true } | { done: false; error?: string }

export default function ScanWebsiteControls({ websiteId, crawlRun, allCategoriesAnalyzed }: { websiteId: string; crawlRun: UnifiedScanRun; allCategoriesAnalyzed: boolean }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)

  async function driveCrawlToCompletion(crawlRunId: string): Promise<DriveResult> {
    for (let i = 0; i < AUTO_CONTINUE_CAP; i++) {
      const result = await continueUnifiedScan(websiteId, crawlRunId)
      if (!result.ok) return { done: false, error: result.error }
      if (result.outcome.done) return { done: true }
      await new Promise((resolve) => setTimeout(resolve, AUTO_CONTINUE_DELAY_MS))
    }
    return { done: false }
  }

  async function runFullPipeline(existingCrawlRunId?: string) {
    if (pendingRef.current) return
    pendingRef.current = true
    // Deferred one microtask tick so this function's state updates never
    // run synchronously inside the mount effect's own call stack below
    // (React discourages/lints synchronous setState-from-effect chains) —
    // functionally instantaneous, just past the effect's synchronous body.
    await Promise.resolve()
    setError(null)
    setPhase('scanning')

    try {
      let crawlRunId = existingCrawlRunId

      if (!crawlRunId) {
        const started = await startUnifiedScan(websiteId)
        if (!started.ok) {
          setError(started.error)
          setPhase('idle')
          return
        }
        crawlRunId = started.crawlRun.id

        if (!ANALYZABLE_STATUSES.has(started.crawlRun.status)) {
          const driveResult = await driveCrawlToCompletion(crawlRunId)
          if (!driveResult.done) {
            if (driveResult.error) setError(driveResult.error)
            setPhase('stalled')
            return
          }
        }
      } else if (ACTIVE_STATUSES.has(crawlRun?.status ?? '')) {
        const driveResult = await driveCrawlToCompletion(crawlRunId)
        if (!driveResult.done) {
          if (driveResult.error) setError(driveResult.error)
          setPhase('stalled')
          return
        }
      }

      setPhase('analyzing')
      await runCategoryAnalyses(websiteId, crawlRunId)

      setPhase('preparing')
      router.refresh()
      // Brief transitional state so "Preparing results…" is visible rather
      // than flashing straight to the refreshed page.
      await new Promise((resolve) => setTimeout(resolve, 350))
      setPhase('idle')
    } catch {
      setError('Something went wrong during the scan. Please try again.')
      setPhase('idle')
    } finally {
      pendingRef.current = false
    }
  }

  useEffect(() => {
    if (!crawlRun) return

    // Auto-resume an interrupted pipeline (an active crawl, or a terminal
    // crawl whose category analyses never completed). runFullPipeline's own
    // state updates are deferred past a microtask tick (see its own
    // `await Promise.resolve()`), so nothing actually sets state
    // synchronously within this effect's call stack — the lint rule's
    // static analysis cannot see that deferral, hence the disable below.
    if (ACTIVE_STATUSES.has(crawlRun.status)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void runFullPipeline(crawlRun.id)
      return
    }

    if (ANALYZABLE_STATUSES.has(crawlRun.status) && !allCategoriesAnalyzed) {
      void runFullPipeline(crawlRun.id)
    }
    // Only the crawl's own identity/status and whether analysis is already
    // complete should re-trigger auto-resume — not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlRun?.id, crawlRun?.status, allCategoriesAnalyzed])

  const isBusy = phase !== 'idle' && phase !== 'stalled'
  const buttonLabel = phase === 'stalled' ? 'Continue Scan' : isBusy ? (PHASE_LABELS[phase] ?? '') : crawlRun ? 'Scan Again' : 'Scan Website'

  function handleClick() {
    void runFullPipeline(phase === 'stalled' ? crawlRun?.id : undefined)
  }

  return (
    <div>
      <Button type="button" variant="outline" disabled={isBusy} className="w-full" onClick={handleClick}>
        {buttonLabel}
      </Button>
      {error && (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  )
}
