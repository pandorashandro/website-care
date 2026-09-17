-- Phase 28 — On-Page SEO Engine 2.0.
--
-- Additive only. Two new tables (on_page_findings, on_page_finding_pages)
-- mirroring architecture_findings/architecture_finding_pages' proven shape
-- and RLS pattern exactly, WITHOUT touching Technical SEO's or Site
-- Architecture's own tables/data in any way. Reuses `crawl_analyses` AS-IS
-- with no schema change there at all: it is already generic (keyed by
-- `(crawl_run_id, analyzer_version)`, no category column), so an On-Page SEO
-- analysis simply gets its own row there with
-- `analyzer_version = 'on-page-v1'`.
--
-- Also adds ONE new crawl_pages column (h1_count) — see that section below
-- for why. No other crawler evidence expansion was needed: On-Page SEO's V1
-- checks (title/meta description length+duplication, H1 presence/count) are
-- fully answerable from title/meta_description/h1_text/h1_count/
-- canonical_url/noindex/http_status/content_type, all already persisted.
--
-- WHY NEW TABLES RATHER THAN REUSING technical_findings/architecture_findings:
-- same reasoning as Phase 27's own migration comment — each category
-- engine's `category` CHECK constraint is scoped to its own vocabulary
-- (title/meta_description/headings here vs. Technical SEO's or Site
-- Architecture's own), and reusing an existing table would either force
-- another awkward widening of an unrelated constraint or blur what that
-- table means. A parallel table keeps each category independently
-- reviewable while sharing every reusable concept at the TypeScript layer
-- (lib/category-engine/types.ts's Severity/Confidence/Actionability/
-- RemediationType/StateValue/RawFindingPageEvidence, plus the newly shared
-- lib/category-engine/eligibility.ts and lib/category-engine/health.ts —
-- see those files' own doc comments).
--
-- This migration does not depend on or alter
-- 20260927000000_technical_seo_findings.sql, 20260930000000_technical_seo_remediation.sql,
-- or 20261007000000_site_architecture_findings.sql in any way.

-- ---------------------------------------------------------------------------
-- crawl_pages: h1_count (Phase 28 additive extraction — reuses the SAME
-- already-fetched HTML/already-called getH1Texts the engine already parses
-- for h1_text; no new network call, no crawler redesign).
-- ---------------------------------------------------------------------------

alter table public.crawl_pages
  add column h1_count integer not null default 0;

comment on column public.crawl_pages.h1_count is
  'Total count of <h1> elements found on this page (0 if none). h1_text (existing column) only ever stores the FIRST one''s text, which cannot distinguish "one H1" from "three H1s, first one shown" -- On-Page SEO''s multiple_h1 check (lib/on-page/checks/headings.ts) needs this count specifically. Reuses the same getH1Texts() call page-extract.ts already makes for h1_text; no new HTML parsing pass.';

-- ---------------------------------------------------------------------------
-- on_page_findings — one row per distinct On-Page SEO problem detected by
-- one analysis, already aggregated across affected pages/duplicate groups.
-- ---------------------------------------------------------------------------

create table public.on_page_findings (
  id uuid primary key default gen_random_uuid(),
  crawl_analysis_id uuid not null references public.crawl_analyses(id) on delete cascade,
  -- Denormalized (both derivable via crawl_analysis_id) so every query and
  -- RLS policy here can single-join directly, exactly like
  -- architecture_findings denormalizes crawl_run_id/website_id.
  crawl_run_id uuid not null references public.crawl_runs(id) on delete cascade,
  website_id uuid not null references public.websites(id) on delete cascade,

  check_key text not null,
  category text not null,
  scope text not null,
  severity text not null,
  confidence text not null,

  title text not null,
  explanation text not null,
  why_it_matters text not null,
  recommendation text not null,

  evidence jsonb not null default '{}'::jsonb,

  affected_page_count integer not null default 0,
  occurrence_count integer not null default 0,
  -- For duplicate_title/duplicate_meta_description, this is the number of
  -- DISTINCT duplicate GROUPS (not individual pages) -- see aggregate.ts's
  -- shared affectedResourceUrl-as-group-key convention, reused verbatim from
  -- Site Architecture's own uniqueTargetCount mechanism. 0 for every other
  -- check, which has no separate "group" concept.
  unique_target_count integer not null default 0,

  actionability text not null,
  estimated_impact text,
  effort text,
  risk text,

  analyzer_version text not null,
  created_at timestamptz not null default now(),

  constraint on_page_findings_category_check
    check (category in ('title', 'meta_description', 'headings')),
  constraint on_page_findings_scope_check check (scope in ('page', 'site')),
  constraint on_page_findings_severity_check check (severity in ('critical', 'high', 'medium', 'low')),
  constraint on_page_findings_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint on_page_findings_actionability_check
    check (actionability in ('safe_fix', 'prepared_fix', 'guided_fix', 'developer_required', 'monitor')),
  constraint on_page_findings_estimated_impact_check
    check (estimated_impact is null or estimated_impact in ('high', 'medium', 'low')),
  constraint on_page_findings_effort_check check (effort is null or effort in ('low', 'medium', 'high')),
  constraint on_page_findings_risk_check check (risk is null or risk in ('low', 'medium', 'high')),

  -- One finding per (analysis, check_key) -- mirrors architecture_findings'
  -- own reasoning: a check firing for multiple pages/groups is one row with
  -- an aggregated count, never N duplicate findings.
  constraint on_page_findings_analysis_check_key_unique unique (crawl_analysis_id, check_key)
);

comment on table public.on_page_findings is
  'One row per distinct On-Page SEO problem found by one crawl_analyses run (analyzer_version = on-page-v1), pre-aggregated across every affected page/duplicate group. Mirrors architecture_findings'' shape (see lib/category-engine/types.ts for the shared vocabulary) but is a separate table because On-Page SEO''s category vocabulary (title/meta_description/headings) is unrelated to Technical SEO''s or Site Architecture''s.';

create index on_page_findings_analysis on public.on_page_findings (crawl_analysis_id);
create index on_page_findings_website_severity on public.on_page_findings (website_id, severity);

alter table public.on_page_findings enable row level security;

revoke all on public.on_page_findings from public, anon, authenticated;

grant select on public.on_page_findings to authenticated;

create policy "on_page_findings_select_own" on public.on_page_findings
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = on_page_findings.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- on_page_finding_pages — the affected page evidence backing one finding.
-- ---------------------------------------------------------------------------

create table public.on_page_finding_pages (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.on_page_findings(id) on delete cascade,
  crawl_page_id uuid references public.crawl_pages(id) on delete set null,
  url text not null,
  -- For duplicate_title/duplicate_meta_description, this holds the shared
  -- normalized value the page's title/meta description was grouped by --
  -- the "group key" -- not a broken/redirect target the way Site
  -- Architecture uses this field. Null for every other On-Page check.
  affected_resource_url text,
  current_state jsonb,
  desired_state jsonb,
  proposed_change text,
  remediation_type text,
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint on_page_finding_pages_remediation_type_check
    check (remediation_type is null or remediation_type in (
      'url_replacement', 'directive_change', 'canonical_change',
      'sitemap_correction', 'robots_correction', 'schema_correction',
      'link_restructure', 'guided_instruction', 'content_field_replacement'
    ))
);

comment on table public.on_page_finding_pages is
  'Per-page evidence for one on_page_findings row. Bounded implicitly by the crawl''s own page budget, exactly like architecture_finding_pages.';

-- (finding_id, url, affected_resource_url) uniqueness, coalescing null to
-- '' -- identical reasoning to architecture_finding_pages' own unique index:
-- a page-level finding (affected_resource_url always null) still dedupes to
-- one row per URL, while a duplicate-group finding (affected_resource_url =
-- the shared group key) keeps one row per (page, group) pair -- which in
-- practice is always one row per page, since a page belongs to exactly one
-- title/meta-description value.
create unique index on_page_finding_pages_finding_url_target_unique
  on public.on_page_finding_pages (finding_id, url, coalesce(affected_resource_url, ''));

create index on_page_finding_pages_finding on public.on_page_finding_pages (finding_id);

alter table public.on_page_finding_pages enable row level security;

revoke all on public.on_page_finding_pages from public, anon, authenticated;

grant select on public.on_page_finding_pages to authenticated;

create policy "on_page_finding_pages_select_own" on public.on_page_finding_pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.on_page_findings
      join public.websites on websites.id = on_page_findings.website_id
      where on_page_findings.id = on_page_finding_pages.finding_id and websites.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `drop table if exists public.on_page_finding_pages;
--  drop table if exists public.on_page_findings;
--  alter table public.crawl_pages drop column if exists h1_count;`
-- — safe at any point; nothing outside Phase 28's own code reads these
-- tables/column, and no existing crawl_analyses/crawl_runs/crawl_pages/
-- technical_findings/architecture_findings row or column is touched by
-- adding them. An On-Page SEO analysis is just another crawl_analyses row
-- (distinguished purely by analyzer_version) -- dropping these two tables
-- and the one column fully reverses this migration via cascade with no
-- further cleanup needed.
