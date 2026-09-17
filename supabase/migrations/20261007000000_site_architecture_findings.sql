-- Phase 27 — Site Architecture & Internal Linking Engine 1.0.
--
-- Additive only. Creates two new tables (architecture_findings,
-- architecture_finding_pages) mirroring technical_findings/
-- technical_finding_pages' proven shape and RLS pattern, WITHOUT touching
-- either of those tables or their data in any way. Reuses `crawl_analyses`
-- AS-IS with no schema change at all: that table was already generic
-- (keyed by `(crawl_run_id, analyzer_version)`, no category column tying it
-- to Technical SEO specifically), so a Site Architecture analysis simply
-- gets its own row there with `analyzer_version = 'site-architecture-v3'`
-- (see lib/architecture/types.ts for the full version history).
--
-- WHY NEW TABLES RATHER THAN REUSING technical_findings/
-- technical_finding_pages: those tables' `category` CHECK constraint is
-- scoped to Technical SEO's own category vocabulary (crawlability,
-- indexability, canonicals, redirects, robots, sitemap, url_protocol,
-- technical_page, structured_data, internationalization,
-- site_wide_consistency) and their name itself signals "Technical SEO" —
-- reusing them for Site Architecture's very different category vocabulary
-- (orphan pages, link depth, underlinked pages, dead ends, link
-- opportunities) would either force another awkward widening of a
-- Technical-SEO-named constraint or silently blur what "technical_findings"
-- means. A parallel table with the identical shape keeps each category
-- engine's findings independently reviewable while sharing every
-- reusable concept at the TypeScript layer (lib/category-engine/types.ts's
-- Severity/Confidence/Actionability/RemediationType/StateValue/
-- RawFindingPageEvidence — see that file's own Phase 27 doc comment).
--
-- This migration does not depend on or alter
-- 20260927000000_technical_seo_findings.sql or
-- 20260930000000_technical_seo_remediation.sql in any way.

-- ---------------------------------------------------------------------------
-- architecture_findings — one row per distinct Site Architecture problem
-- detected by one analysis, already aggregated across affected pages/edges.
-- ---------------------------------------------------------------------------

create table public.architecture_findings (
  id uuid primary key default gen_random_uuid(),
  crawl_analysis_id uuid not null references public.crawl_analyses(id) on delete cascade,
  -- Denormalized (both derivable via crawl_analysis_id) so every query and
  -- RLS policy here can single-join directly, exactly like
  -- technical_findings denormalizes crawl_run_id/website_id.
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
  unique_target_count integer not null default 0,

  actionability text not null,
  estimated_impact text,
  effort text,
  risk text,

  analyzer_version text not null,
  created_at timestamptz not null default now(),

  constraint architecture_findings_category_check
    check (category in (
      'orphan_pages', 'link_depth', 'internal_link_health',
      'link_distribution', 'dead_ends', 'link_opportunities',
      'site_wide_consistency'
    )),
  constraint architecture_findings_scope_check check (scope in ('page', 'site')),
  constraint architecture_findings_severity_check check (severity in ('critical', 'high', 'medium', 'low')),
  constraint architecture_findings_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint architecture_findings_actionability_check
    check (actionability in ('safe_fix', 'prepared_fix', 'guided_fix', 'developer_required', 'monitor')),
  constraint architecture_findings_estimated_impact_check
    check (estimated_impact is null or estimated_impact in ('high', 'medium', 'low')),
  constraint architecture_findings_effort_check check (effort is null or effort in ('low', 'medium', 'high')),
  constraint architecture_findings_risk_check check (risk is null or risk in ('low', 'medium', 'high')),

  -- One finding per (analysis, check_key) — mirrors
  -- technical_findings_analysis_check_key_unique's own reasoning exactly:
  -- a check firing for multiple pages/edges is one row with an aggregated
  -- count, never N duplicate findings.
  constraint architecture_findings_analysis_check_key_unique unique (crawl_analysis_id, check_key)
);

comment on table public.architecture_findings is
  'One row per distinct Site Architecture problem found by one crawl_analyses run (analyzer_version = site-architecture-v3, see lib/architecture/types.ts for the version history), pre-aggregated across every affected page/edge. Mirrors technical_findings'' shape (see lib/category-engine/types.ts for the shared vocabulary) but is a separate table because Site Architecture''s category vocabulary is unrelated to Technical SEO''s.';

create index architecture_findings_analysis on public.architecture_findings (crawl_analysis_id);
create index architecture_findings_website_severity on public.architecture_findings (website_id, severity);

alter table public.architecture_findings enable row level security;

revoke all on public.architecture_findings from public, anon, authenticated;

grant select on public.architecture_findings to authenticated;

create policy "architecture_findings_select_own" on public.architecture_findings
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = architecture_findings.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- architecture_finding_pages — the affected page/edge evidence backing one
-- finding.
-- ---------------------------------------------------------------------------

create table public.architecture_finding_pages (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.architecture_findings(id) on delete cascade,
  crawl_page_id uuid references public.crawl_pages(id) on delete set null,
  url text not null,
  affected_resource_url text,
  current_state jsonb,
  desired_state jsonb,
  proposed_change text,
  remediation_type text,
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint architecture_finding_pages_remediation_type_check
    check (remediation_type is null or remediation_type in (
      'url_replacement', 'directive_change', 'canonical_change',
      'sitemap_correction', 'robots_correction', 'schema_correction',
      'link_restructure', 'guided_instruction'
    ))
);

comment on table public.architecture_finding_pages is
  'Per-page/per-edge evidence for one architecture_findings row. Bounded implicitly by the crawl''s own page budget, exactly like technical_finding_pages.';

-- (finding_id, url, affected_resource_url) uniqueness, coalescing null to
-- '' — identical reasoning to technical_finding_pages'
-- technical_finding_pages_finding_url_target_unique: a page-level finding
-- (affected_resource_url always null) still dedupes to one row per URL,
-- while a relationship finding (e.g. one source page linking to two
-- different broken targets) correctly keeps both distinct rows.
create unique index architecture_finding_pages_finding_url_target_unique
  on public.architecture_finding_pages (finding_id, url, coalesce(affected_resource_url, ''));

create index architecture_finding_pages_finding on public.architecture_finding_pages (finding_id);

alter table public.architecture_finding_pages enable row level security;

revoke all on public.architecture_finding_pages from public, anon, authenticated;

grant select on public.architecture_finding_pages to authenticated;

create policy "architecture_finding_pages_select_own" on public.architecture_finding_pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.architecture_findings
      join public.websites on websites.id = architecture_findings.website_id
      where architecture_findings.id = architecture_finding_pages.finding_id and websites.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `drop table if exists public.architecture_finding_pages;
--  drop table if exists public.architecture_findings;`
-- — safe at any point; nothing outside Phase 27's own code reads these
-- tables, and no existing crawl_analyses/crawl_runs/crawl_pages/
-- technical_findings row or column is touched by adding them. A Site
-- Architecture analysis is just another crawl_analyses row (distinguished
-- purely by analyzer_version) -- dropping these two tables alone fully
-- reverses this migration via cascade with no further cleanup needed.
