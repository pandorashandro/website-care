# Site-wide crawler (Phase 25)

Phase 25 adds a persisted, resumable, site-wide crawler — an entirely new, additive capability living in `lib/crawler/`, `supabase/migrations/20260920000000_crawl_foundation.sql`, and the `crawl_runs`/`crawl_pages`/`crawl_links` tables. It does not replace, migrate, or depend on the pre-existing website scanner in any way.

## Two separate systems, on purpose

**The existing scanner (`scans`/`issues`, `lib/scanner/crawl-website.ts`)** is unchanged by Phase 25. It runs entirely inside one request (`scanWebsite` in `app/dashboard/actions.ts`), does its own small in-memory breadth-first crawl capped at `MAX_PAGES = 20`, and writes directly to `scans`/`issues` — the tables the website Overview report (`app/dashboard/websites/[id]/page.tsx`) reads. "Scan Again" on that page still means exactly what it always has.

**The Phase 25 crawler (`crawl_runs`/`crawl_pages`/`crawl_links`, `lib/crawler/`)** is a different, additive capability: a persisted frontier that can discover and process far more pages (up to a plan's `maxCrawlPages`, and never more than the flat `MAX_CRAWL_PAGES` safety ceiling) across many bounded invocations instead of one request. It is surfaced as its own "Site Scan" tab (`app/dashboard/websites/[id]/site-scan/`) and never reads or writes `scans`/`issues`.

Keeping these separate — rather than trying to unify them in Phase 25 — is deliberate: unifying them would mean rewriting the existing checks and the Overview report's data model, which is explicitly out of scope for this phase (see "what Phase 25 is not," below). The two systems can safely coexist because they share no table and no write path; the full test suite (`npm test`) passing unchanged is the evidence that adding the crawler created no regression in the existing scanner.

**What Phase 26+ can build on:** `crawl_pages` (one row per discovered page: URL, status, HTTP status, title/meta/H1/canonical/noindex, response time/size) and `crawl_links` (the discovered internal link graph) are the persisted evidence a future phase can read from directly — for site architecture analysis, broken-link detection, a richer on-page engine, etc. — without needing another crawler redesign. Nothing about their schema is provisional to Phase 25 alone.

## Architecture

- **`supabase/migrations/20260920000000_crawl_foundation.sql`** — `crawl_runs`, `crawl_pages`, `crawl_links`, and the `claim_crawl_pages` SQL function (atomic `FOR UPDATE SKIP LOCKED` claiming with stale-processing reclaim). RLS restricts every table to `select`-only for `authenticated`, scoped through `websites.user_id`; all writes go through the service-role admin client.
- **`lib/crawler/store.ts`** — the `CrawlStore` interface. `lib/crawler/engine.ts` depends only on this, never on Supabase directly, so the orchestration logic is testable against `tests/helpers/fake-crawl-store.ts` (an in-memory fake) without a live database.
- **`lib/crawler/supabase-store.ts`** — the real, thin Supabase-backed implementation.
- **`lib/crawler/engine.ts`** — `startCrawlRun` (seeds the frontier, does a best-effort sitemap pass) and `processCrawlBatch` (does one wall-clock-bounded chunk of work, then returns). Progress counters are always recomputed fresh from `crawl_pages` row counts (`CrawlStore.recomputeCrawlRunCounts`), never accumulated in memory — see that method's own doc comment for the lost-update race this closes under overlapping invocations.
- **`app/dashboard/websites/[id]/crawl-actions.ts`** — `startWebsiteCrawl`/`continueWebsiteCrawl`, the ownership-checked Server Action entry points. Both re-derive the caller's own session and website ownership before touching the engine.

## No background worker: what drives continuation in V1

This codebase runs on Next.js/Vercel/Supabase — there is no queue consumer, cron dispatcher, or long-running process available to drive a crawl forward on its own. Continuation in V1 is driven by the **browser tab**: `app/dashboard/websites/[id]/site-scan/site-scan-controls.tsx` calls `continueWebsiteCrawl` repeatedly (with a small delay between calls) for as long as the crawl is `queued`/`running` and the Site Scan page stays open, up to a generous safety cap (`AUTO_CONTINUE_CAP`) per mount. If the tab is closed or the cap is hit first, nothing is lost — the crawl's entire state lives in `crawl_runs`/`crawl_pages`, and reopening the page (or clicking the visible "Continue Scan" button) picks the crawl up exactly where it left off, including reclaiming any page that was `processing` when the tab disappeared (`claim_crawl_pages`' stale-reclaim, `STALE_CLAIM_MINUTES`).

Because two overlapping invocations of `processCrawlBatch` for the same `crawl_run_id` are safe by construction (`FOR UPDATE SKIP LOCKED` for page claims, `recomputeCrawlRunCounts` for progress counters), it is not a bug — merely unnecessary extra work — if a user has the Site Scan page open in two tabs at once, or if React's Strict Mode double-invokes the driving effect in development.

## Plan-aware crawl budgets

`lib/entitlements/plans.ts`'s `PlanCapabilities.maxCrawlPages` (Free 30 / Bloom 150 / Bloom Pro 500 — see `docs/entitlements.md`) is resolved server-side in `startWebsiteCrawl` from the caller's own current entitlements and passed into `startCrawlRun` as `planMaxPages`. `lib/crawler/limits.ts`'s `clampPageBudget(requested, planMaxPages)` applies this as a second clamp alongside the flat, plan-independent `MAX_CRAWL_PAGES` safety ceiling — a client-supplied `requestedPageBudget` can never push `effective_page_budget` past either. `requested_page_budget` and `effective_page_budget` are both stored on `crawl_runs`, so "what was asked for" and "what was actually enforced" are always independently visible.

## Known limitations (V1)

- **DNS-rebinding TOCTOU**: URLs are validated (scheme, hostname, resolved-address blocklist) before fetching, but the resolved address is not pinned across that gap the way a custom DNS-aware HTTP agent could. Closing this fully would require a dependency (e.g. `undici`'s connect hook) not available in this environment; the existing blocklist (private/link-local/loopback IPv4 and IPv6, cloud metadata addresses) still blocks the overwhelmingly common cases. Documented here and in `lib/scanner/checks.ts` rather than closed with a risky hand-rolled low-level networking change.
- **No cancel action in V1** — a crawl runs to a terminal state (`completed`/`partial`/`failed`) or sits `queued`/`running` until a plan/global limit or genuine failure ends it; there is no user-facing "stop this crawl" control yet.
- **Large crawls need the tab open** — a Bloom Pro crawl approaching the 500-page ceiling can take many bounded invocations to finish; per the continuation model above, that means either keeping the Site Scan tab open or returning periodically to click "Continue Scan."

## What Phase 25 is not

Per this phase's explicit scope: not a rewrite of the existing scanner or its checks, not a new findings/issues architecture, not JS-rendered/headless crawling, not GSC/GA4/rank tracking/monitoring/notifications, not an Expert Mode or Agency feature, and no pricing/Paddle changes. See the Phase 25 completion report for the full list.
