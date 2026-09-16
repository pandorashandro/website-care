-- Phase 26 — Technical SEO Engine 2.0: finding model + small additive
-- extensions to Phase 25's crawl evidence.
--
-- NOT YET APPLIED to any live Supabase project — same convention as every
-- prior migration under supabase/migrations/. Review against the live
-- schema before applying. Phase 25's migration
-- (20260920000000_crawl_foundation.sql) must be applied first; this one
-- assumes crawl_runs/crawl_pages/crawl_links already exist.
--
-- Additive only. Adds four columns to two existing Phase 25 tables (see
-- "Additive extensions to Phase 25 evidence" below — nothing here changes
-- Phase 25's own read/write behavior for any column that already existed)
-- and creates three new tables (crawl_analyses, technical_findings,
-- technical_finding_pages). Touches no existing scans/issues table, column,
-- policy, or grant — Phase 26 is a parallel, additive capability sitting on
-- top of Phase 25's crawl evidence, exactly like Phase 25 was additive on
-- top of the pre-existing single-page scanner.

-- ---------------------------------------------------------------------------
-- Additive extensions to Phase 25 evidence.
-- ---------------------------------------------------------------------------

-- `redirect_count`: fetchPage (lib/scanner/checks.ts) has always computed
-- this (FetchPageResult.redirectCount) but the Phase 25A engine never
-- persisted it — no new network call or crawl-behavior change is needed to
-- populate it, only one additional field on an already-computed result.
-- Needed for Phase 26's Redirects category ("excessive redirect chain
-- where evidence supports it").
alter table public.crawl_pages
  add column redirect_count integer not null default 0;

comment on column public.crawl_pages.redirect_count is
  'Number of redirect hops fetchPage followed before reaching this row''s final_url/http_status. 0 for a page fetched directly with no redirect. Populated by lib/crawler/engine.ts from fetchPage''s own redirectCount, which was already being computed and simply not persisted before Phase 26.';

-- `robots_status`/`sitemap_status`/`sitemap_url_count`: lib/crawler/engine.ts's
-- startCrawlRun already fetches and parses robots.txt and the sitemap(s) once
-- per crawl (to seed the frontier) — these columns persist the OUTCOME of
-- work already being done, again with no new network call, so Phase 26's
-- robots.txt and XML sitemap categories have real site-wide evidence to
-- analyze instead of re-fetching robots.txt/sitemap.xml a second time.
alter table public.crawl_runs
  add column robots_status text,
  add column sitemap_status text,
  add column sitemap_url_count integer;

alter table public.crawl_runs
  add constraint crawl_runs_robots_status_check
    check (robots_status is null or robots_status in ('ok', 'not_found', 'unreachable'));

alter table public.crawl_runs
  add constraint crawl_runs_sitemap_status_check
    check (sitemap_status is null or sitemap_status in ('ok', 'unreachable', 'empty'));

comment on column public.crawl_runs.robots_status is
  'Outcome of the one robots.txt fetch startCrawlRun already performs: ok (fetched and parsed), not_found (404/410 — a normal, non-error state), or unreachable (network/blocked/non-2xx). Null only for a crawl_run created before this column existed.';

comment on column public.crawl_runs.sitemap_status is
  'Outcome of the sitemap discovery pass startCrawlRun already performs: ok (at least one URL collected), empty (a sitemap file was reachable but contained no usable URLs), or unreachable (no sitemap file could be fetched at all -- covers both a genuine 404 and a network failure, which the underlying evidence cannot reliably distinguish). Null only for a crawl_run created before this column existed.';

comment on column public.crawl_runs.sitemap_url_count is
  'Total URLs collected across all sitemap files during startCrawlRun''s discovery pass (lib/crawler/sitemap.ts''s DiscoveredSitemapUrls.urls.length), before any budget slicing. Null only for a crawl_run created before this column existed.';

-- ---------------------------------------------------------------------------
-- crawl_analyses — one row per Technical SEO analysis execution over a
-- crawl_run.
-- ---------------------------------------------------------------------------

create table public.crawl_analyses (
  id uuid primary key default gen_random_uuid(),
  crawl_run_id uuid not null references public.crawl_runs(id) on delete cascade,
  -- Denormalized for a single-join RLS policy, exactly like crawl_pages'
  -- own website_id.
  website_id uuid not null references public.websites(id) on delete cascade,

  status text not null default 'running',
  analyzer_version text not null default 'technical-v1',
  findings_count integer not null default 0,
  error_message text,

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint crawl_analyses_status_check
    check (status in ('running', 'completed', 'failed')),

  -- Analysis is keyed by (crawl_run_id, analyzer_version), not a fresh row
  -- per attempt: re-analyzing the SAME crawl_run with the SAME analyzer
  -- version is meant to be a safe, idempotent re-run (see Checkpoint 9),
  -- not an ever-growing history. A different analyzer_version (a future
  -- Phase 26.x rule change) gets its own row and its own findings, so past
  -- results remain inspectable rather than being silently overwritten by a
  -- behavior change.
  constraint crawl_analyses_run_version_unique unique (crawl_run_id, analyzer_version)
);

comment on table public.crawl_analyses is
  'One row per (crawl_run, analyzer_version) Technical SEO analysis. Re-running analysis for the same pair updates this row and replaces its technical_findings rather than accumulating duplicates or a growing history — see lib/technical-seo/store.ts''s saveAnalysis.';

create index crawl_analyses_website_created_at on public.crawl_analyses (website_id, created_at desc);

alter table public.crawl_analyses enable row level security;

revoke all on public.crawl_analyses from public, anon, authenticated;

grant select on public.crawl_analyses to authenticated;

create policy "crawl_analyses_select_own" on public.crawl_analyses
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = crawl_analyses.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- technical_findings — one row per distinct technical SEO problem detected
-- by one analysis, already aggregated across affected pages (see
-- technical_finding_pages below for the per-page evidence).
-- ---------------------------------------------------------------------------

create table public.technical_findings (
  id uuid primary key default gen_random_uuid(),
  crawl_analysis_id uuid not null references public.crawl_analyses(id) on delete cascade,
  -- Denormalized (both derivable via crawl_analysis_id) so every query and
  -- RLS policy in this phase can single-join directly, exactly like
  -- crawl_pages/crawl_links denormalize website_id/crawl_run_id.
  crawl_run_id uuid not null references public.crawl_runs(id) on delete cascade,
  website_id uuid not null references public.websites(id) on delete cascade,

  -- Stable identifier for the check that produced this finding (e.g.
  -- 'redirect_loop', 'canonical_points_to_error') — see
  -- lib/technical-seo/types.ts's CheckKey. This, not title text, is what a
  -- future UI/export/Phase 32-33 prioritization engine should key on.
  check_key text not null,
  category text not null,
  scope text not null,
  severity text not null,
  confidence text not null,

  title text not null,
  explanation text not null,
  why_it_matters text not null,
  recommendation text not null,

  -- Structured technical evidence backing this finding (e.g. {"httpStatus":
  -- 404, "canonicalUrl": "..."}) — the "expert-ready data" this phase's
  -- product goal calls for, even though no Expert Mode UI reads it yet.
  evidence jsonb not null default '{}'::jsonb,

  affected_page_count integer not null default 0,

  fixability text not null,
  -- Nullable/categorical by design (never fake numeric precision) — see
  -- this phase's own "do not invent fake precision" instruction. Null
  -- means "not yet defensible to estimate," not "zero."
  estimated_impact text,
  effort text,
  risk text,

  analyzer_version text not null,
  created_at timestamptz not null default now(),

  constraint technical_findings_category_check
    check (category in (
      'crawlability', 'indexability', 'canonicals', 'redirects', 'robots',
      'sitemap', 'url_protocol', 'technical_page', 'site_wide_consistency'
    )),
  constraint technical_findings_scope_check check (scope in ('page', 'site')),
  constraint technical_findings_severity_check check (severity in ('critical', 'high', 'medium', 'low')),
  constraint technical_findings_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint technical_findings_fixability_check
    check (fixability in (
      'safe_automatic', 'prepared_approval', 'guided_manual', 'developer_required', 'informational_monitor'
    )),
  constraint technical_findings_estimated_impact_check
    check (estimated_impact is null or estimated_impact in ('high', 'medium', 'low')),
  constraint technical_findings_effort_check check (effort is null or effort in ('low', 'medium', 'high')),
  constraint technical_findings_risk_check check (risk is null or risk in ('low', 'medium', 'high')),

  -- One finding per (analysis, check_key) — a check that fires for multiple
  -- pages is represented as ONE row with affected_page_count > 1 and one
  -- technical_finding_pages row per affected page, never as N duplicate
  -- findings. This is what Checkpoint 3's "20 pages should not be 20 cards"
  -- requirement is built on. A check that legitimately needs more than one
  -- distinct finding per analysis (rare — none in this phase's library
  -- does) would need a compound key added here later; V1 has no such check.
  constraint technical_findings_analysis_check_key_unique unique (crawl_analysis_id, check_key)
);

comment on table public.technical_findings is
  'One row per distinct technical SEO problem found by one crawl_analyses run, pre-aggregated across every affected page. Phase 26''s durable finding model — see lib/technical-seo/types.ts. Not a replacement for scans/issues, which remain the legacy single-page scanner''s own model.';

create index technical_findings_analysis on public.technical_findings (crawl_analysis_id);
create index technical_findings_website_severity on public.technical_findings (website_id, severity);

alter table public.technical_findings enable row level security;

revoke all on public.technical_findings from public, anon, authenticated;

grant select on public.technical_findings to authenticated;

create policy "technical_findings_select_own" on public.technical_findings
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = technical_findings.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- technical_finding_pages — the affected-URL evidence backing one finding.
-- ---------------------------------------------------------------------------

create table public.technical_finding_pages (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.technical_findings(id) on delete cascade,
  -- Null when the affected page's own crawl_pages row is later removed
  -- (cascade from a crawl_run/website deletion elsewhere would already
  -- cascade-delete this row too via finding_id; this set-null path exists
  -- only for the more surgical, unlikely case of the specific page row
  -- being deleted independently) — url/detail below are never re-derived
  -- from crawl_page_id, so losing the link loses no displayable evidence.
  crawl_page_id uuid references public.crawl_pages(id) on delete set null,
  url text not null,
  -- Small, finding-specific evidence snippet for THIS page (e.g.
  -- {"httpStatus": 404} or {"canonicalUrl": "https://..."}) — deliberately
  -- separate from technical_findings.evidence, which carries finding-level
  -- (not per-page) evidence.
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint technical_finding_pages_finding_url_unique unique (finding_id, url)
);

comment on table public.technical_finding_pages is
  'Per-page evidence for one technical_findings row — at most one row per (finding, url). Bounded implicitly by the crawl''s own page budget (see crawl_runs.effective_page_budget): a finding can never reference more affected pages than the crawl itself discovered.';

create index technical_finding_pages_finding on public.technical_finding_pages (finding_id);

alter table public.technical_finding_pages enable row level security;

revoke all on public.technical_finding_pages from public, anon, authenticated;

grant select on public.technical_finding_pages to authenticated;

create policy "technical_finding_pages_select_own" on public.technical_finding_pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.technical_findings
      join public.websites on websites.id = technical_findings.website_id
      where technical_findings.id = technical_finding_pages.finding_id and websites.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `drop table if exists public.technical_finding_pages;
--  drop table if exists public.technical_findings;
--  drop table if exists public.crawl_analyses;
--  alter table public.crawl_runs drop column if exists sitemap_url_count;
--  alter table public.crawl_runs drop column if exists sitemap_status;
--  alter table public.crawl_runs drop column if exists robots_status;
--  alter table public.crawl_pages drop column if exists redirect_count;`
-- — safe at any point; nothing outside this migration and Phase 26's own
-- code reads the new columns/tables, and no existing row's other data is
-- touched.
