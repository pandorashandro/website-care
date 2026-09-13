-- Phase 25A — Site-Wide Crawler Core: persistence foundation.
--
-- NOT YET APPLIED to any live Supabase project — prepared per this
-- repository's established convention (see every prior migration under
-- supabase/migrations/). Review against the live schema before applying.
--
-- Additive only. Creates three new tables (crawl_runs, crawl_pages,
-- crawl_links) and one new function (claim_crawl_pages). Touches no
-- existing table, column, policy, or grant. `websites` remains the sole
-- ownership root — every new table below carries its own `website_id`
-- (denormalized onto crawl_pages/crawl_links for direct, single-join RLS
-- and query convenience) rather than introducing any new ownership concept,
-- per the Phase 24 audit's explicit "Part I — Agency Readiness" guidance:
-- new tables must join through `websites.user_id`, never re-derive
-- ownership a second, independent way.
--
-- `scans`/`issues` are NOT touched, removed, or migrated by this file.
-- They remain the single-page scanner's own model; the site-wide crawler
-- introduced here is a parallel, additive capability. Phase 25B is
-- explicitly responsible for any product-level cutover between the two —
-- this migration does not assume or force one.

-- ---------------------------------------------------------------------------
-- crawl_runs — one row per site-wide crawl attempt.
-- ---------------------------------------------------------------------------

create table public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites(id) on delete cascade,

  status text not null default 'queued',

  -- The budget the caller asked for vs. the budget actually enforced (after
  -- clamping to this phase's hard ceiling — see lib/crawler/limits.ts). Both
  -- are stored so a later UI can honestly show "you asked for X, Y was used"
  -- rather than silently substituting one for the other.
  requested_page_budget integer not null,
  effective_page_budget integer not null,
  max_depth integer not null default 5,

  -- Cached, denormalized progress counters — the authoritative frontier
  -- state always lives on crawl_pages.status; these are a convenience
  -- summary updated by the engine as it processes batches, safe to
  -- recompute from crawl_pages at any time if they were ever to drift
  -- (e.g. after an abnormal process exit mid-batch).
  pages_discovered integer not null default 0,
  pages_processed integer not null default 0,
  pages_succeeded integer not null default 0,
  pages_failed integer not null default 0,
  pages_skipped integer not null default 0,

  failure_summary text,
  crawler_version text not null default 'v1',

  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint crawl_runs_status_check
    check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  constraint crawl_runs_budget_check
    check (requested_page_budget > 0 and effective_page_budget > 0 and effective_page_budget <= requested_page_budget),
  constraint crawl_runs_max_depth_check check (max_depth > 0)
);

comment on table public.crawl_runs is
  'One row per site-wide crawl attempt for a website. status is the crawl-level lifecycle (queued/running/completed/partial/failed/cancelled); crawl_pages.status is the per-page frontier state the engine actually resumes from. Ownership is via website_id -> websites.user_id, exactly like every other integration table.';

comment on column public.crawl_runs.effective_page_budget is
  'requested_page_budget clamped to this phase''s hard per-crawl ceiling (see lib/crawler/limits.ts). Never entitlements-driven in this phase — Phase 24''s roadmap defers plan-based crawl budgets to a later phase; this is a flat, product-wide safety ceiling only.';

comment on column public.crawl_runs.pages_discovered is
  'Denormalized cache of count(crawl_pages) for this run, maintained by the engine per batch. Not a source of truth — recomputable from crawl_pages at any time.';

-- Only one active (queued/running) crawl per website at a time — enforced
-- at the database level, not just in application code, so a duplicate
-- "start crawl" call (a double click, two tabs, a retried request) can
-- never create two concurrently-active runs for the same website.
create unique index crawl_runs_one_active_per_website
  on public.crawl_runs (website_id)
  where status in ('queued', 'running');

create index crawl_runs_website_started_at
  on public.crawl_runs (website_id, started_at desc);

alter table public.crawl_runs enable row level security;

revoke all on public.crawl_runs from public, anon, authenticated;

-- Read-only for the owning user — mirrors subscriptions' posture (this is
-- legitimate product data the owner should eventually see directly, not a
-- credential). All writes happen exclusively through the service-role
-- admin client from lib/crawler/engine.ts, after an independent,
-- application-level ownership check via the ordinary session-aware client
-- (see app/dashboard/websites/[id]/crawl-actions.ts) — RLS here is a second,
-- defense-in-depth layer, not the only boundary.
grant select on public.crawl_runs to authenticated;

create policy "crawl_runs_select_own" on public.crawl_runs
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = crawl_runs.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- crawl_pages — one row per discovered/processed URL per crawl run.
-- ---------------------------------------------------------------------------

create table public.crawl_pages (
  id uuid primary key default gen_random_uuid(),
  crawl_run_id uuid not null references public.crawl_runs(id) on delete cascade,
  -- Denormalized for a single-join RLS policy and for cross-run page-identity
  -- lookups (Phase 24's "does this same page exist in an earlier crawl"
  -- question) without joining through crawl_runs every time.
  website_id uuid not null references public.websites(id) on delete cascade,

  url text not null,
  -- The exact URL as discovered (pre-normalization), only when it differs
  -- from `url` — kept for diagnostics, never used for identity/dedup.
  discovered_url text,
  -- The URL actually served after following redirects, once fetched.
  final_url text,

  depth integer not null default 0,
  discovered_via text not null default 'link',

  -- The frontier state. 'queued' = not yet claimed; 'processing' = claimed
  -- by an in-progress batch (see claim_crawl_pages below); 'completed'/
  -- 'failed'/'skipped' are terminal. This column, not any external queue,
  -- IS the persisted frontier.
  status text not null default 'queued',
  claimed_at timestamptz,

  http_status integer,
  content_type text,
  canonical_url text,
  robots_allowed boolean,
  noindex boolean,

  -- Deliberately minimal page metadata (title/meta description/first H1
  -- only) — enough for Phase 26-29's analyzers to start from, and enough
  -- for a future UI to show "what page is this." Full content, every
  -- heading, every image, every structured-data block, every performance
  -- metric is explicitly OUT of scope for this table per this phase's own
  -- instruction ("do not turn crawl_pages into a dumping ground") — those
  -- belong in page_snapshots/page_metrics/findings tables a later phase
  -- introduces once an analyzer actually needs them.
  title text,
  meta_description text,
  h1_text text,

  response_time_ms integer,
  response_size_bytes integer,
  error_reason text,

  discovered_at timestamptz not null default now(),
  fetched_at timestamptz,

  constraint crawl_pages_status_check
    check (status in ('queued', 'processing', 'completed', 'failed', 'skipped')),
  constraint crawl_pages_discovered_via_check
    check (discovered_via in ('seed', 'link', 'sitemap')),
  constraint crawl_pages_depth_check check (depth >= 0),

  -- The one hard duplicate-prevention rule this phase requires: the same
  -- normalized URL is never queued/processed twice within one crawl run.
  -- Every discovery-time insert uses ON CONFLICT (crawl_run_id, url) DO
  -- NOTHING against this constraint, which is what makes discovery
  -- duplicate-safe regardless of how many times the same link is found.
  constraint crawl_pages_run_url_unique unique (crawl_run_id, url)
);

comment on table public.crawl_pages is
  'One row per normalized URL discovered within one crawl_run. status is the persisted crawl frontier (queued -> processing -> completed/failed/skipped) that makes the crawl resumable across separate invocations without any external queue. Deliberately minimal metadata columns — see this table''s own column comments and lib/crawler/engine.ts''s module doc comment for what is intentionally NOT stored here.';

comment on column public.crawl_pages.claimed_at is
  'Set when a batch claims this row (status -> processing). A row still processing after a stale-claim threshold (see claim_crawl_pages) is treated as abandoned by a crashed/timed-out invocation and becomes re-claimable — this is the mechanism that makes an interrupted crawl resumable rather than permanently stuck.';

-- The claim query (see claim_crawl_pages) filters on (crawl_run_id, status)
-- and orders by (depth, discovered_at) — this index serves both.
create index crawl_pages_run_status_depth
  on public.crawl_pages (crawl_run_id, status, depth, discovered_at);

-- Cross-run page-identity lookups (Phase 24's monitoring/diffing use case).
create index crawl_pages_website_url on public.crawl_pages (website_id, url);

alter table public.crawl_pages enable row level security;

revoke all on public.crawl_pages from public, anon, authenticated;

grant select on public.crawl_pages to authenticated;

create policy "crawl_pages_select_own" on public.crawl_pages
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = crawl_pages.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- crawl_links — the discovered site graph (one row per source-page ->
-- target-URL edge).
-- ---------------------------------------------------------------------------

create table public.crawl_links (
  id uuid primary key default gen_random_uuid(),
  crawl_run_id uuid not null references public.crawl_runs(id) on delete cascade,
  source_page_id uuid not null references public.crawl_pages(id) on delete cascade,
  target_url text not null,
  -- Null when the target was discovered but not itself crawled (external,
  -- or discovered past the crawl budget) — never guessed/backfilled.
  target_page_id uuid references public.crawl_pages(id) on delete set null,
  link_type text not null,
  anchor_text text,
  discovered_at timestamptz not null default now(),

  constraint crawl_links_link_type_check check (link_type in ('internal', 'external')),
  -- `anchor_text` is not yet populated by this phase's engine (always
  -- null today), so deduplicating on (crawl_run_id, source_page_id,
  -- target_url) alone loses no real data and is purely a correctness
  -- improvement: it makes re-persisting the same edge idempotent if a
  -- page is ever reclaimed and reprocessed after a stale/abandoned claim
  -- (see claim_crawl_pages) — without this, reprocessing would insert a
  -- second, duplicate edge for every link on that page. If a future
  -- phase starts populating distinct anchor text per occurrence, this
  -- constraint should be revisited then, not before.
  constraint crawl_links_run_source_target_unique unique (crawl_run_id, source_page_id, target_url)
);

comment on table public.crawl_links is
  'The discovered site graph: one row per (source page, target URL) edge found during a crawl run. This is evidence storage only — Phase 27 (Architecture & Internal Linking) is responsible for analyzing it (orphan pages, link-depth outliers, internal-link-importance scoring). No analysis happens in this phase.';

create index crawl_links_run_source on public.crawl_links (crawl_run_id, source_page_id);
create index crawl_links_run_target on public.crawl_links (crawl_run_id, target_page_id) where target_page_id is not null;

alter table public.crawl_links enable row level security;

revoke all on public.crawl_links from public, anon, authenticated;

grant select on public.crawl_links to authenticated;

create policy "crawl_links_select_own" on public.crawl_links
  for select
  to authenticated
  using (
    exists (
      select 1 from public.crawl_runs
      join public.websites on websites.id = crawl_runs.website_id
      where crawl_runs.id = crawl_links.crawl_run_id and websites.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- claim_crawl_pages — atomic, concurrency-safe frontier claiming.
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER (the default): only ever called via the service-role
-- admin client (lib/crawler/engine.ts), which already bypasses RLS by
-- Supabase's own design — no privilege escalation is needed or granted.
--
-- `for update skip locked` is what makes concurrent claiming safe: if two
-- invocations of the batch processor ever overlap (e.g. a retried request
-- while a previous one is still finishing), each one only ever claims rows
-- the other hasn't already locked, so the same page is never processed
-- twice concurrently. Rows are also reclaimable if their previous claim is
-- older than p_stale_after_minutes, which is what lets a crashed or
-- timed-out invocation's claimed-but-never-finished pages become
-- available again for the NEXT invocation — the mechanism this phase's
-- resumability requirement depends on.
create or replace function public.claim_crawl_pages(
  p_crawl_run_id uuid,
  p_batch_size integer,
  p_stale_after_minutes integer default 10
) returns setof public.crawl_pages
language plpgsql
as $$
begin
  return query
  update public.crawl_pages
  set status = 'processing', claimed_at = now()
  where id in (
    select id from public.crawl_pages
    where crawl_run_id = p_crawl_run_id
      and (
        status = 'queued'
        or (status = 'processing' and claimed_at < now() - make_interval(mins => p_stale_after_minutes))
      )
    order by depth asc, discovered_at asc
    for update skip locked
    limit p_batch_size
  )
  returning *;
end;
$$;

comment on function public.claim_crawl_pages is
  'Atomically claims up to p_batch_size queued (or stale-processing) crawl_pages rows for one crawl_run, using FOR UPDATE SKIP LOCKED so concurrent invocations never claim the same row. Called only from lib/crawler/engine.ts via the service-role admin client.';

revoke execute on function public.claim_crawl_pages from public, anon, authenticated;
grant execute on function public.claim_crawl_pages to service_role;

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `drop function if exists public.claim_crawl_pages(uuid, integer, integer);
--  drop table if exists public.crawl_links;
--  drop table if exists public.crawl_pages;
--  drop table if exists public.crawl_runs;`
-- — safe at any point; nothing outside this migration references any of
-- these objects, and no existing table's schema, data, or policy is
-- touched by adding them.
