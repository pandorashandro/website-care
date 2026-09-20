import 'server-only'
import { getEntitlementsForUserId } from '@/lib/entitlements/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCompletedScansForWebsite, getCanonicalSnapshotForWebsite, selectComparisonPair } from '@/app/dashboard/websites/[id]/scan-history'
import { buildChangeSummary } from './compare'
import { evaluateMeaningfulChange } from './notification-rules'
import { reconcileCadenceWithEntitlements } from './entitlement-reconciliation'
import { computeNextDueAt } from './cadence'
import { runCrawlToCompletion, runCategoryAnalysesForMonitoring } from './run-canonical-scan'
import { finalizeMonitoringClaim, type ClaimedMonitoringWebsite, type MonitoringRunFinalization } from './due-service'
import { createMeaningfulChangeEvent, createMonitoringScanFailedEvent } from './event-service'
import { createDeliveryForEvent, processPendingDeliveries } from './delivery-service'
import { sanitizeMonitoringError } from './errors'
import type { MonitoringCadence } from '@/lib/entitlements/plans'

/**
 * Sprint 2, Prompt 2 — the orchestrator for ONE already-claimed website's
 * full monitoring cycle: re-check entitlements -> invoke the canonical
 * scan pipeline -> compare against the correct prior baseline -> decide
 * whether the result is meaningful -> persist an event + attempt delivery
 * -> release the claim with an honest outcome. Never touches a second
 * website's claim; the caller (app/api/monitoring/run/route.ts) loops this
 * over each website it claims.
 *
 * FAILURE SAFETY: every path below that does not end in a genuine,
 * complete success releases the claim via finalizeMonitoringClaim with
 * `run_status: 'idle'` and NEVER advances `last_monitored_crawl_run_id`
 * unless the crawl and comparison genuinely completed — a crash, timeout,
 * or thrown exception anywhere in this function is caught by the outer
 * try/catch and recorded as an honest `last_run_status: 'failed'`, never
 * silently treated as success and never left permanently claimed.
 */
export async function runMonitoringCycleForWebsite(claimed: ClaimedMonitoringWebsite, deadlineMs: number): Promise<void> {
  let attemptedCrawlRunId: string | null = null

  try {
    const entitlements = await getEntitlementsForUserId(claimed.userId)
    const reconciliation = reconcileCadenceWithEntitlements(claimed.cadence, entitlements)

    if (reconciliation.action === 'disable') {
      // The owner's plan no longer permits scheduled monitoring at all
      // (downgraded to Free, or a lapsed subscription) — turn monitoring
      // off outright rather than running an unentitled scan. This is not
      // a scan failure; last_run_status is left untouched.
      await finalizeMonitoringClaim(claimed.websiteId, claimed.claimToken, { monitoringEnabled: false, cadence: 'none', nextDueAt: null })
      return
    }

    const effectiveCadence = reconciliation.cadence
    const cadencePatch: Partial<MonitoringRunFinalization> = reconciliation.action === 'downgrade' ? { cadence: effectiveCadence } : {}

    const { crawlRun, done } = await runCrawlToCompletion(claimed.websiteId, claimed.websiteUrl, entitlements.maxCrawlPages, deadlineMs)
    attemptedCrawlRunId = crawlRun.id

    if (!done) {
      // The crawl is still genuinely in progress when this invocation's
      // own deadline arrived — release the claim immediately (never wait
      // out the full stale-claim window) so the NEXT scheduler tick can
      // resume it right away via the crawl engine's own persisted
      // frontier. Nothing concluded this cycle, so last_run_status/
      // last_monitored_crawl_run_id/next_due_at are all left untouched.
      await finalizeMonitoringClaim(claimed.websiteId, claimed.claimToken, cadencePatch)
      return
    }

    if (crawlRun.status === 'failed') {
      await handleFailure(claimed, cadencePatch, effectiveCadence, crawlRun.id, crawlRun.failure_summary ?? 'The scheduled scan could not complete.')
      return
    }

    // completed or partial — real, analyzable canonical evidence exists.
    await runCategoryAnalysesForMonitoring(crawlRun.id)

    const admin = createAdminClient()
    const recentScans = await listCompletedScansForWebsite(admin, claimed.websiteId, 2)
    const pair = selectComparisonPair(recentScans)

    // Defensive: this cycle's own crawl_run should always be `pair.current`
    // (it is the one just marked completed/partial). If it is not — a
    // genuinely concurrent manual scan finished at the same instant with a
    // later timestamp — this cycle does not fabricate a comparison against
    // a mismatched pair; it simply records its own scan as the latest
    // successful monitoring check and lets the next cycle compare fresh.
    const ownScanIsCurrent = pair?.current.crawlRunId === crawlRun.id

    if (ownScanIsCurrent && pair?.previous) {
      const [current, previous] = await Promise.all([
        getCanonicalSnapshotForWebsite(admin, claimed.websiteId, pair.current.crawlRunId),
        getCanonicalSnapshotForWebsite(admin, claimed.websiteId, pair.previous.crawlRunId),
      ])

      if (current && previous) {
        const summary = buildChangeSummary(previous, current)
        const { meaningful, reasons } = evaluateMeaningfulChange(summary)

        if (meaningful) {
          const event = await createMeaningfulChangeEvent({
            websiteId: claimed.websiteId,
            currentCrawlRunId: pair.current.crawlRunId,
            previousCrawlRunId: pair.previous.crawlRunId,
            summary,
            reasons,
          })
          await createDeliveryForEvent(event.id, claimed.notificationPreference)
          await processPendingDeliveries(5)
        }
      }
    }

    await finalizeMonitoringClaim(claimed.websiteId, claimed.claimToken, {
      ...cadencePatch,
      lastMonitoredCrawlRunId: crawlRun.id,
      lastRunStatus: 'success',
      lastRunAt: new Date().toISOString(),
      lastRunError: null,
      nextDueAt: computeNextDueAt(effectiveCadence),
    })
  } catch (err) {
    try {
      await handleFailure(claimed, {}, claimed.cadence, attemptedCrawlRunId, sanitizeMonitoringError(err))
    } catch {
      // Sprint 2, Prompt 3 security/reliability review: handleFailure
      // itself doing a SECOND write (event + delivery + claim release)
      // could itself throw (e.g. a transient DB error). This function's
      // own documented contract is that it NEVER throws — a caller looping
      // over several claimed websites in one invocation (see
      // app/api/monitoring/run/route.ts) must never have one website's
      // double-failure abort every other website's own processing in the
      // same tick. Falling all the way through to here means even the
      // failure recording failed; the claim is simply abandoned and
      // recovered by the standard stale-claim reclaim path (see claim.ts)
      // on a later tick, rather than risking an uncaught exception here.
    }
  }
}

async function handleFailure(
  claimed: ClaimedMonitoringWebsite,
  cadencePatch: Partial<MonitoringRunFinalization>,
  effectiveCadence: MonitoringCadence,
  crawlRunId: string | null,
  rawFailure: string
): Promise<void> {
  const sanitized = sanitizeMonitoringError(rawFailure)

  const event = await createMonitoringScanFailedEvent(claimed.websiteId, crawlRunId, sanitized)
  if (event) {
    await createDeliveryForEvent(event.id, claimed.notificationPreference)
    await processPendingDeliveries(5)
  }

  await finalizeMonitoringClaim(claimed.websiteId, claimed.claimToken, {
    ...cadencePatch,
    lastRunStatus: 'failed',
    lastRunAt: new Date().toISOString(),
    lastRunError: sanitized,
    nextDueAt: computeNextDueAt(effectiveCadence),
  })
}
