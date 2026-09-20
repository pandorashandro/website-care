import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { fetchAndClaimDueWebsites } from '@/lib/monitoring/due-service'
import { runMonitoringCycleForWebsite } from '@/lib/monitoring/monitoring-run'
import { processPendingDeliveries } from '@/lib/monitoring/delivery-service'
import { isAuthorizedBearerToken } from '@/lib/monitoring/cron-auth'

/**
 * Sprint 2, Prompt 2 — STEP 15. The one production trigger for scheduled
 * monitoring: a server-to-server endpoint meant to be invoked by Vercel
 * Cron (see vercel.json's own `crons` entry) or an equivalent external
 * scheduler — there is no persistent Node worker in this codebase's actual
 * infrastructure (Next.js on Vercel's serverless/edge functions), exactly
 * like lib/crawler/engine.ts's own "no background worker" design. This
 * route is the scheduled-monitoring analog of a browser tab driving
 * scan-website-controls.tsx's own continueUnifiedScan loop — just
 * triggered by a scheduler tick instead of a person clicking a button.
 *
 * AUTHENTICATION: exactly the documented Vercel Cron pattern — this route
 * is a no-op (401) unless the request carries
 * `Authorization: Bearer <CRON_SECRET>` matching the `CRON_SECRET`
 * environment variable, which Vercel Cron is configured to send
 * automatically for a `crons` entry once that variable is set in the
 * deployment's environment. NOT CONFIGURED YET in this repository or any
 * live environment — see this sprint's own report for exactly what a
 * human still needs to do in the Vercel dashboard before this endpoint
 * does anything in production. Never trusts any other signal (a query
 * param, a referer, an IP) as authentication.
 *
 * WORK BUDGET: bounded by `maxDuration` below (Vercel's own per-invocation
 * time limit for this route), never by an item count alone — one call
 * claims up to MAX_WEBSITES_PER_INVOCATION due/reclaimable websites (see
 * lib/monitoring/due-service.ts's own concurrency guarantee) and processes
 * them one at a time, each bounded by its own share of the remaining
 * invocation budget, leaving INVOCATION_SAFETY_BUFFER_MS of headroom for
 * this function to return cleanly rather than being killed mid-write. Any
 * due website this invocation does not get to (too many due at once, or
 * the budget ran out) simply stays due for the next scheduler tick — nothing
 * is lost, since due-ness is a persisted column, not an in-memory queue.
 *
 * SPRINT 2, PROMPT 4 — VERCEL HOBBY DEPLOYMENT CONSTRAINT (deliberately a
 * hosting-tier configuration choice, never an architecture change):
 * Vercel's Hobby plan caps a serverless function's `maxDuration` at 60
 * seconds (Pro allows up to 300s by default, more with Fluid compute) and
 * restricts Cron Jobs to at most once-daily invocation regardless of the
 * expression in vercel.json (a more frequent schedule is REJECTED at
 * deploy time on Hobby). Both constants below, and vercel.json's own
 * schedule, are set to the Hobby-safe values so this route can actually
 * deploy and be smoke-tested today:
 *   - `maxDuration = 60` (Hobby's ceiling).
 *   - `MAX_WEBSITES_PER_INVOCATION = 1` — with only ~55s of usable budget
 *     after the safety buffer, attempting more than one website per
 *     invocation risks starting several crawls and finishing none
 *     cleanly; one website getting a full, honest attempt is strictly
 *     better than several getting a truncated one. Every due website not
 *     reached this tick simply waits for the next tick — nothing is lost.
 *   - vercel.json's cron schedule is `0 4 * * *` (once daily) instead of
 *     the every-15-minutes schedule this architecture is actually designed
 *     for — a due website may now wait up to ~24h past its own
 *     `next_due_at` before a tick claims it, and a large site's crawl may
 *     legitimately span MULTIPLE daily ticks to finish (the crawl engine's
 *     own persisted-frontier resumability, unchanged from Prompt 2,
 *     already makes this safe — just slower).
 *
 * WHEN WEBIOOM MOVES TO VERCEL PRO: raise `maxDuration` back to 300 (or
 * higher with Fluid compute), raise `MAX_WEBSITES_PER_INVOCATION` back to
 * 5, and change vercel.json's schedule back to `*\/15 * * * *` — all three
 * changes are confined to this file and vercel.json; no other monitoring
 * code depends on any of these specific numbers.
 */

export const maxDuration = 60

const MAX_WEBSITES_PER_INVOCATION = 1
const INVOCATION_SAFETY_BUFFER_MS = 8_000
const PER_WEBSITE_MAX_CRAWL_MS = maxDuration * 1000 - INVOCATION_SAFETY_BUFFER_MS

export async function GET(request: NextRequest) {
  if (!isAuthorizedBearerToken(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse(null, { status: 401 })
  }

  const invocationDeadlineMs = Date.now() + maxDuration * 1000 - INVOCATION_SAFETY_BUFFER_MS

  const claimedWebsites = await fetchAndClaimDueWebsites(MAX_WEBSITES_PER_INVOCATION)

  let processed = 0
  for (const website of claimedWebsites) {
    if (Date.now() >= invocationDeadlineMs) break

    const perWebsiteDeadlineMs = Math.min(invocationDeadlineMs, Date.now() + PER_WEBSITE_MAX_CRAWL_MS)
    try {
      await runMonitoringCycleForWebsite(website, perWebsiteDeadlineMs)
    } catch {
      // Defense-in-depth: runMonitoringCycleForWebsite's own contract is
      // to never throw (see its own doc comment), but one website's
      // unexpected failure must never abort every other claimed website's
      // processing in this same invocation, nor skip the delivery-retry
      // pass below.
    }
    processed++
  }

  // A best-effort retry pass for anything still pending/failed-and-
  // retryable from THIS or an earlier invocation — see
  // delivery-service.ts's own doc comment. Never blocks the response on
  // more than a small, bounded number of attempts.
  await processPendingDeliveries(20)

  return NextResponse.json({ claimed: claimedWebsites.length, processed })
}
