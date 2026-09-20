/**
 * Sprint 2, Prompt 2 — STEP 3. Shared constants and pure helpers for the
 * database-backed claiming mechanism used by BOTH the monitoring-run
 * scheduler claim (website_monitoring_settings.run_status/claimed_at/
 * claim_token) and the delivery claim (monitoring_deliveries.status/
 * claimed_at/claim_token) — one reclaim convention, reused, not
 * reinvented per table. This deliberately mirrors
 * lib/crawler/limits.ts's own STALE_CLAIM_MINUTES/claimPages pattern: an
 * in-flight claim older than a stale threshold is treated as abandoned
 * (a crashed/timed-out invocation) and becomes claimable again, rather
 * than relying on any in-memory lock, which cannot survive a serverless
 * invocation ending.
 *
 * THE EXACT CONCURRENCY GUARANTEE: claiming is always a single, atomic,
 * conditional SQL UPDATE of the form
 *   `update <table> set ... where id = $1 and <still-eligible predicate>`
 * issued by the service-role admin client (see due-service.ts/
 * delivery-service.ts). Postgres's own MVCC row-level locking guarantees
 * that when two invocations race to claim the SAME row, the second
 * invocation's UPDATE blocks until the first COMMITs, then re-evaluates
 * its own WHERE clause against the now-committed row; since the first
 * invocation already changed the claim state (run_status/status,
 * claimed_at, claim_token), the second invocation's WHERE clause no
 * longer matches and it affects zero rows — checked via `.select()`
 * returning an empty array, never assumed from an "ok" response alone.
 * This requires no advisory lock, no SELECT ... FOR UPDATE, and no
 * in-memory coordination, and is safe across any number of concurrent
 * serverless invocations, retries, or scheduler ticks.
 */

/**
 * How long a website's monitoring run may sit in run_status = 'running'
 * before being treated as abandoned. Must comfortably exceed the
 * monitoring cron route's own `maxDuration` (300s / 5 minutes — see
 * app/api/monitoring/run/route.ts) so a genuinely still-running invocation
 * is never wrongly reclaimed out from under itself; 15 minutes is 3x that
 * ceiling, the same safety-margin reasoning STALE_CLAIM_MINUTES itself
 * documents for crawl_pages.
 */
export const MONITORING_STALE_CLAIM_MINUTES = 15

/** How long a delivery may sit in status = 'sending' before being treated as an abandoned send attempt and made reclaimable. */
export const DELIVERY_STALE_CLAIM_MINUTES = 10

/** A delivery that has failed this many times is left `status: 'failed'` without further automatic retry — surfaced honestly rather than retried forever against a genuinely broken configuration. */
export const MAX_DELIVERY_ATTEMPTS = 5

/** ISO timestamp of `staleMinutes` ago, for a `.lt('claimed_at', ...)` reclaim filter — the one place "how long ago is stale" is computed, shared by both claim call sites. */
export function staleClaimThreshold(staleMinutes: number, now: Date = new Date()): string {
  return new Date(now.getTime() - staleMinutes * 60 * 1000).toISOString()
}
