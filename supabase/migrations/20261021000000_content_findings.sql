-- Phase 29 — Content Intelligence Engine.
--
-- Additive only. Two new tables (content_findings, content_finding_pages)
-- mirroring on_page_findings/on_page_finding_pages' proven shape and RLS
-- pattern exactly, WITHOUT touching Technical SEO's, Site Architecture's, or
-- On-Page SEO's own tables/data in any way. Reuses `crawl_analyses` AS-IS
-- with no schema change there at all — an On-Page-style analysis simply
-- gets its own row there with `analyzer_version = 'content-v1'`.
--
-- Also adds FIVE new crawl_pages columns (content_text, content_word_count,
-- content_paragraph_count, content_heading_texts, content_hash) — see that
-- section below for why these specific, compact fields were chosen instead
-- of persisting raw page HTML.
--
-- WHY NEW TABLES RATHER THAN REUSING technical_findings/architecture_findings/
-- on_page_findings: identical reasoning to every prior category engine's own
-- migration comment — each category's `category` CHECK constraint is scoped
-- to its own vocabulary, and reusing an existing table would either force an
-- awkward widening of an unrelated constraint or blur what that table means.
--
-- This migration does not depend on or alter
-- 20260927000000_technical_seo_findings.sql, 20260930000000_technical_seo_remediation.sql,
-- 20261007000000_site_architecture_findings.sql, or
-- 20261014000000_on_page_findings.sql in any way.

-- ---------------------------------------------------------------------------
-- crawl_pages: compact content evidence (Phase 29 additive extraction —
-- reuses the SAME already-fetched HTML every other extractor already
-- parses; no new network call, no headless browser, no crawler redesign).
--
-- Deliberately NOT raw page HTML: a real page's HTML commonly runs
-- 50-300KB; persisting it per page, per crawl, per re-crawl would grow
-- crawl_pages by an order of magnitude for data almost none of which
-- (styling, scripts, markup structure) Content Intelligence reasons about.
-- These five compact, structured fields are enough for every Phase 29 V1
-- check and remain reusable for a future AI interpretation pass.
-- ---------------------------------------------------------------------------

alter table public.crawl_pages
  add column content_text text,
  add column content_word_count integer not null default 0,
  add column content_paragraph_count integer not null default 0,
  add column content_heading_texts jsonb not null default '[]'::jsonb,
  add column content_hash text;

comment on column public.crawl_pages.content_text is
  'Cleaned visible body text extracted from <p> elements only (paragraphs joined by "\n\n"), bounded to 4000 characters (lib/crawler/content-extract.ts''s CONTENT_TEXT_MAX_CHARS) -- a PREFIX only on a long page. Only publicly-fetched page body text is ever captured here, the same trust boundary as title/meta_description/h1_text. Null for non-HTML pages or pages with no extractable paragraph text.';

comment on column public.crawl_pages.content_word_count is
  'Total word count of the FULL visible paragraph text (untruncated) -- computed before content_text''s own storage truncation is applied, so thin-content detection is never skewed by the bounded sample.';

comment on column public.crawl_pages.content_paragraph_count is
  'Total count of non-empty <p> elements on the FULL page (untruncated).';

comment on column public.crawl_pages.content_heading_texts is
  'Up to 20 <h2> section-heading texts (lib/crawler/content-extract.ts''s CONTENT_MAX_HEADINGS), each truncated to 150 characters -- a weak structural signal only, never proof a specific section is present or absent.';

comment on column public.crawl_pages.content_hash is
  'sha256 hex fingerprint of the FULL (untruncated) normalized paragraph text, used for O(1) exact-duplicate-content grouping across pages. Null when the page has fewer than MIN_WORDS_FOR_FINGERPRINT (10) words -- near-empty pages are excluded from duplicate grouping entirely (already covered by substantively_thin_page; hashing near-nothing would produce meaningless "matches").';

-- ---------------------------------------------------------------------------
-- content_findings — one row per distinct Content Intelligence problem or
-- opportunity detected by one analysis, already aggregated across affected
-- pages/duplicate groups.
-- ---------------------------------------------------------------------------

create table public.content_findings (
  id uuid primary key default gen_random_uuid(),
  crawl_analysis_id uuid not null references public.crawl_analyses(id) on delete cascade,
  crawl_run_id uuid not null references public.crawl_runs(id) on delete cascade,
  website_id uuid not null references public.websites(id) on delete cascade,

  check_key text not null,
  category text not null,
  scope text not null,
  severity text not null,
  confidence text not null,

  -- Phase 29-specific: separates a scored PROBLEM from a zero-score
  -- OPPORTUNITY (see lib/content/health.ts's own doc comment) -- an
  -- opportunity finding is still persisted/shown, but never enters the
  -- deduction formula. Also separates DETERMINISTIC evidence from AI
  -- interpretation (not used by any check in this phase's initial
  -- implementation, but designed in from the start per this phase's own
  -- "deterministic evidence must remain separate from AI interpretation"
  -- instruction).
  finding_kind text not null,
  evidence_source text not null,

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

  constraint content_findings_category_check
    check (category in ('thinness', 'duplication', 'structure', 'completeness')),
  constraint content_findings_scope_check check (scope in ('page', 'site')),
  constraint content_findings_severity_check check (severity in ('critical', 'high', 'medium', 'low')),
  constraint content_findings_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint content_findings_finding_kind_check check (finding_kind in ('problem', 'opportunity')),
  constraint content_findings_evidence_source_check check (evidence_source in ('deterministic', 'ai_interpreted', 'hybrid')),
  constraint content_findings_actionability_check
    check (actionability in ('safe_fix', 'prepared_fix', 'guided_fix', 'developer_required', 'monitor')),
  constraint content_findings_estimated_impact_check
    check (estimated_impact is null or estimated_impact in ('high', 'medium', 'low')),
  constraint content_findings_effort_check check (effort is null or effort in ('low', 'medium', 'high')),
  constraint content_findings_risk_check check (risk is null or risk in ('low', 'medium', 'high')),

  constraint content_findings_analysis_check_key_unique unique (crawl_analysis_id, check_key)
);

comment on table public.content_findings is
  'One row per distinct Content Intelligence problem/opportunity found by one crawl_analyses run (analyzer_version = content-v1), pre-aggregated across every affected page/duplicate group. Mirrors on_page_findings'' shape but adds finding_kind (problem vs opportunity) and evidence_source (deterministic/ai_interpreted/hybrid) -- see lib/category-engine/types.ts and lib/content/types.ts for the shared and Content-specific vocabulary.';

create index content_findings_analysis on public.content_findings (crawl_analysis_id);
create index content_findings_website_severity on public.content_findings (website_id, severity);

alter table public.content_findings enable row level security;

revoke all on public.content_findings from public, anon, authenticated;

grant select on public.content_findings to authenticated;

create policy "content_findings_select_own" on public.content_findings
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = content_findings.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- content_finding_pages — the affected page evidence backing one finding.
-- ---------------------------------------------------------------------------

create table public.content_finding_pages (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.content_findings(id) on delete cascade,
  crawl_page_id uuid references public.crawl_pages(id) on delete set null,
  url text not null,
  -- For exact_duplicate_content, this holds the shared content_hash group
  -- key the page was grouped by (mirrors on_page_finding_pages' own
  -- affectedResourceUrl-as-group-key convention). Null for every other
  -- Content check.
  affected_resource_url text,
  current_state jsonb,
  desired_state jsonb,
  proposed_change text,
  remediation_type text,
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint content_finding_pages_remediation_type_check
    check (remediation_type is null or remediation_type in (
      'url_replacement', 'directive_change', 'canonical_change',
      'sitemap_correction', 'robots_correction', 'schema_correction',
      'link_restructure', 'guided_instruction', 'content_field_replacement'
    ))
);

comment on table public.content_finding_pages is
  'Per-page evidence for one content_findings row. Bounded implicitly by the crawl''s own page budget, exactly like on_page_finding_pages.';

create unique index content_finding_pages_finding_url_target_unique
  on public.content_finding_pages (finding_id, url, coalesce(affected_resource_url, ''));

create index content_finding_pages_finding on public.content_finding_pages (finding_id);

alter table public.content_finding_pages enable row level security;

revoke all on public.content_finding_pages from public, anon, authenticated;

grant select on public.content_finding_pages to authenticated;

create policy "content_finding_pages_select_own" on public.content_finding_pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.content_findings
      join public.websites on websites.id = content_findings.website_id
      where content_findings.id = content_finding_pages.finding_id and websites.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `drop table if exists public.content_finding_pages;
--  drop table if exists public.content_findings;
--  alter table public.crawl_pages drop column if exists content_hash;
--  alter table public.crawl_pages drop column if exists content_heading_texts;
--  alter table public.crawl_pages drop column if exists content_paragraph_count;
--  alter table public.crawl_pages drop column if exists content_word_count;
--  alter table public.crawl_pages drop column if exists content_text;`
-- — safe at any point; nothing outside Phase 29's own code reads these
-- tables/columns, and no existing crawl_analyses/crawl_runs/crawl_pages/
-- technical_findings/architecture_findings/on_page_findings row or column
-- is touched by adding them.
