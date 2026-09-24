/**
 * Phase 25A — flat, product-wide crawl safety limits. Deliberately NOT
 * entitlements-driven: Phase 24's roadmap treats plan-based crawl budgets
 * as a later decision (once real usage data exists to size them from) —
 * these are hard safety ceilings that apply to every plan equally, closing
 * the "infinite crawling" / resource-abuse requirement this phase's
 * security checkpoint calls out, independent of whatever a future
 * entitlements-based budget adds on top.
 */

/** Absolute ceiling on pages per crawl run, regardless of what was requested. */
export const MAX_CRAWL_PAGES = 500

/** Default budget used when a caller doesn't request a specific one. */
export const DEFAULT_CRAWL_PAGE_BUDGET = 100

/** Absolute ceiling on crawl depth from the seed URL. */
export const MAX_CRAWL_DEPTH = 8

export const DEFAULT_CRAWL_DEPTH = 5

/** How many crawl_pages rows one processCrawlBatch() invocation claims and processes per inner loop iteration. */
export const BATCH_SIZE = 5

/**
 * Wall-clock budget for ONE processCrawlBatch() invocation. Chosen well
 * under typical serverless function time limits (Vercel's default Node
 * function duration is 10s on Hobby, up to 60s/300s on paid tiers) so a
 * single invocation reliably returns control to its caller — with
 * meaningful work done — rather than risking the platform killing it
 * mid-batch. Resumability (persisted per-page frontier state, stale-claim
 * reclaiming) is what makes repeated bounded invocations safe regardless
 * of the exact platform limit in effect.
 */
export const BATCH_WALL_CLOCK_BUDGET_MS = 8_000

/** A crawl_pages row claimed ('processing') longer than this without a persisted result is treated as abandoned by a crashed/timed-out invocation and becomes re-claimable. Must comfortably exceed one page's worst-case processing time (a single fetchPage call already caps at ~10s). */
export const STALE_CLAIM_MINUTES = 5

/**
 * Engine-hardening pass (2026-09-24): a crawl run that has been
 * queued/running longer than this — regardless of how much of its page
 * budget it has nominally left to claim — is presumed abandoned (the
 * browser tab that was driving it via repeated bounded
 * processCrawlBatch() calls was closed, lost network, or crashed; see
 * lib/crawler/engine.ts's own module doc comment on why this codebase has
 * no background worker to otherwise notice). Without this ceiling, such a
 * run stays 'running' in the database forever — nothing ever revisits it
 * to declare it done — which is exactly the "permanently stuck Scanning"
 * failure mode. `processCrawlBatch` checks this on ENTRY, so the very next
 * time anything touches the run (a reopened dashboard tab's auto-resume
 * effect, a manual "Continue Scan" click, a monitoring cron tick) is what
 * actually terminates it — there is still no proactive background sweep,
 * but no normal path can leave the run stuck without ever being noticed
 * again, and revisiting it is the ordinary product flow (reopening a
 * website's Overview page, or the dashboard, both auto-resume any active
 * crawl on mount).
 */
export const MAX_CRAWL_RUN_AGE_MINUTES = 30

/**
 * Engine-hardening pass (2026-09-24): if a crawl has attempted at least
 * this many pages and NONE of them succeeded, the website is presumed
 * fundamentally unreachable (DNS failure, TLS failure, a blanket
 * bot-blocking rule, the server being down) — continuing to grind through
 * the rest of the page budget one identical failure at a time would only
 * waste the remaining wall-clock/request budget without ever producing
 * usable evidence. `processCrawlBatch` fails the run fast once this
 * threshold is crossed, rather than waiting for the full budget or the
 * wall-clock ceiling above to notice the same thing much later.
 */
export const MIN_ATTEMPTS_BEFORE_UNREACHABLE_ABORT = 5

/** True once a crawl run has been active longer than MAX_CRAWL_RUN_AGE_MINUTES — see that constant's own doc comment. */
export function isCrawlRunTimedOut(crawlRun: { started_at: string | null; created_at: string }, nowMs: number = Date.now()): boolean {
  const referenceTime = crawlRun.started_at ?? crawlRun.created_at
  const ageMs = nowMs - new Date(referenceTime).getTime()
  return Number.isFinite(ageMs) && ageMs > MAX_CRAWL_RUN_AGE_MINUTES * 60_000
}

/** True once enough pages have been attempted with zero successes that the site is presumed unreachable — see MIN_ATTEMPTS_BEFORE_UNREACHABLE_ABORT's own doc comment. */
export function isCrawlPresumedUnreachable(counts: { pagesProcessed: number; pagesSucceeded: number }): boolean {
  return counts.pagesProcessed >= MIN_ATTEMPTS_BEFORE_UNREACHABLE_ABORT && counts.pagesSucceeded === 0
}

/** Per-page hard cap on discovered outbound links actually persisted/enqueued — bounds a single pathological page (e.g. a machine-generated link farm) from exploding the frontier in one step. */
export const MAX_LINKS_PER_PAGE = 200

/**
 * Phase 25B: the exact `crawl_pages.error_reason` used when a still-queued
 * page is bulk-marked 'skipped' because the crawl's page budget was
 * exhausted (see skipRemainingQueuedPages) — as opposed to a page marked
 * 'skipped' because it was actually claimed, checked against robots.txt,
 * and found disallowed (see engine.ts's processOnePage). Both share the
 * same `status` value, but only the LATTER represents a page the crawler
 * actually attempted — CrawlStore.recomputeCrawlRunCounts uses this exact
 * string to exclude budget-exhausted pages from `pagesProcessed` (a page
 * that was never claimed was never "processed") while still counting them
 * in `pagesSkipped` (a user-facing total that legitimately includes both
 * reasons). Kept as one shared constant, not a string literal repeated in
 * three places, specifically so the write side (engine.ts) and the two
 * read sides (supabase-store.ts, the test fake) can never drift apart.
 */
export const BUDGET_SKIP_REASON = 'crawl_page_budget_reached'

/** The `crawl_pages.error_reason` used when still-queued pages are bulk-skipped because the site was presumed unreachable (see MIN_ATTEMPTS_BEFORE_UNREACHABLE_ABORT) — distinct from BUDGET_SKIP_REASON so the dashboard/debugging can tell "we stopped early because nothing was reachable" apart from "we stopped because the plan's page limit was reached." */
export const UNREACHABLE_SKIP_REASON = 'crawl_site_presumed_unreachable'

/** Sitemap discovery safety limits — see lib/crawler/sitemap.ts. */
export const MAX_SITEMAP_FILES = 10
export const MAX_SITEMAP_INDEX_DEPTH = 2
export const MAX_URLS_FROM_SITEMAPS = 1000

/**
 * Phase 25B: `planMaxPages` is a SECOND, independent clamp on top of the
 * flat `MAX_CRAWL_PAGES` safety ceiling above — the caller's resolved plan
 * entitlement (lib/entitlements/plans.ts's `maxCrawlPages`), never trusted
 * from client input. Both clamps always apply together (`Math.min` of all
 * three of: requested, planMaxPages, MAX_CRAWL_PAGES): a plan ceiling can
 * never be configured to exceed the product-wide safety ceiling, and the
 * safety ceiling can never be bypassed by a caller omitting `planMaxPages`
 * (the default keeps pre-Phase-25B call sites, and every test not
 * exercising plan-awareness specifically, behaving exactly as before).
 */
export function clampPageBudget(requested: number, planMaxPages: number = MAX_CRAWL_PAGES): number {
  const ceiling = Math.min(planMaxPages, MAX_CRAWL_PAGES)
  if (!Number.isFinite(requested) || requested <= 0) return Math.min(DEFAULT_CRAWL_PAGE_BUDGET, ceiling)
  return Math.min(Math.floor(requested), ceiling)
}

export function clampDepth(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested) || requested <= 0) return DEFAULT_CRAWL_DEPTH
  return Math.min(Math.floor(requested), MAX_CRAWL_DEPTH)
}
