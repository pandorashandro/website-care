-- Unified webioom engine, Prompt 2 — Performance / Accessibility / Security
-- canonical engines.
--
-- Additive only. Does NOT touch technical_findings, architecture_findings,
-- on_page_findings, content_findings, crawl_analyses, or any previously
-- applied migration in any way (including 20261104000000_content_analysis_
-- coverage.sql, which has ALREADY BEEN APPLIED to production and is not
-- referenced or altered here).
--
-- TWO CHANGES:
--
-- 1. crawl_pages: THREE new jsonb evidence columns (performance_evidence,
--    accessibility_evidence, security_evidence) — see
--    lib/crawler/pillar-extract.ts for exactly what each contains and why.
--    Bundled as jsonb rather than ~15 new scalar columns because each is a
--    single compact, structured fact-set computed once at crawl time and
--    consumed as a whole by exactly one engine's checks — the same
--    trade-off this schema already makes for content_heading_texts/
--    hreflang_tags (structured arrays) vs. scalar columns.
--
-- 2. pillar_findings / pillar_finding_pages — ONE shared pair of tables for
--    all three new engines (Performance, Accessibility, Security),
--    discriminated by a `pillar` column. This deliberately DEPARTS from the
--    "one table pair per category" convention every prior engine
--    (technical_findings, architecture_findings, on_page_findings,
--    content_findings) established — those each have their own genuinely
--    distinct `category` vocabulary worth isolating. Performance/
--    Accessibility/Security are being introduced together, in the same
--    pass, with structurally IDENTICAL persistence needs and no risk of
--    colliding vocabularies (each has its own `pillar` value plus its own
--    `category` sub-vocabulary within that), so one shared schema (and one
--    shared TypeScript store implementation, see lib/pillars/) cuts real
--    duplication without blurring what any one row means — a finding's
--    `pillar` value is never ambiguous. Each pillar still gets its OWN
--    `crawl_analyses` row (analyzer_version = 'performance-v1' /
--    'accessibility-v1' / 'security-v1'), so scores/status are fully
--    independent regardless of the shared finding table.
--
-- This migration does not depend on or alter any prior migration.

-- ---------------------------------------------------------------------------
-- crawl_pages: performance_evidence / accessibility_evidence / security_evidence
-- ---------------------------------------------------------------------------

alter table public.crawl_pages
  add column performance_evidence jsonb not null default '{}'::jsonb,
  add column accessibility_evidence jsonb not null default '{}'::jsonb,
  add column security_evidence jsonb not null default '{}'::jsonb;

comment on column public.crawl_pages.performance_evidence is
  'Compact, structured performance facts computed once at crawl time (lib/crawler/pillar-extract.ts extractPerformanceEvidence): script/stylesheet counts, render-blocking script count, images missing width/height or loading=lazy, and the raw Content-Encoding/Cache-Control response header values. Never a verdict -- interpretation belongs to lib/performance/checks/*.';

comment on column public.crawl_pages.accessibility_evidence is
  'Compact, structured accessibility facts computed once at crawl time (lib/crawler/pillar-extract.ts extractAccessibilityEvidence): image alt-attribute presence, html lang attribute, form-label coverage, link accessible-name coverage, duplicate ids, iframe titles. Never a verdict -- interpretation belongs to lib/accessibility/checks/*. Deterministic static-HTML evidence only -- this can never prove keyboard behavior, screen-reader usability, color contrast, or dynamic ARIA behavior.';

comment on column public.crawl_pages.security_evidence is
  'Compact, structured website-security-hygiene facts computed once at crawl time (lib/crawler/pillar-extract.ts extractSecurityEvidence): HTTPS usage, mixed-content reference count, insecure-form count, and the raw values of six security-relevant response headers. Passive, publicly-observable hygiene evidence only -- never a penetration test, never proof a site is "secure".';

-- ---------------------------------------------------------------------------
-- pillar_findings — one row per distinct Performance/Accessibility/Security
-- problem or opportunity found by one crawl_analyses run.
-- ---------------------------------------------------------------------------

create table public.pillar_findings (
  id uuid primary key default gen_random_uuid(),
  crawl_analysis_id uuid not null references public.crawl_analyses(id) on delete cascade,
  crawl_run_id uuid not null references public.crawl_runs(id) on delete cascade,
  website_id uuid not null references public.websites(id) on delete cascade,

  pillar text not null,
  check_key text not null,
  category text not null,
  scope text not null,
  finding_kind text not null,
  evidence_source text not null,
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

  constraint pillar_findings_pillar_check check (pillar in ('performance', 'accessibility', 'security')),
  constraint pillar_findings_scope_check check (scope in ('page', 'site')),
  constraint pillar_findings_finding_kind_check check (finding_kind in ('problem', 'opportunity')),
  constraint pillar_findings_evidence_source_check check (evidence_source in ('deterministic', 'ai_interpreted', 'hybrid')),
  constraint pillar_findings_severity_check check (severity in ('critical', 'high', 'medium', 'low')),
  constraint pillar_findings_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint pillar_findings_actionability_check
    check (actionability in ('safe_fix', 'prepared_fix', 'guided_fix', 'developer_required', 'monitor')),
  constraint pillar_findings_estimated_impact_check check (estimated_impact is null or estimated_impact in ('high', 'medium', 'low')),
  constraint pillar_findings_effort_check check (effort is null or effort in ('low', 'medium', 'high')),
  constraint pillar_findings_risk_check check (risk is null or risk in ('low', 'medium', 'high')),

  constraint pillar_findings_analysis_check_key_unique unique (crawl_analysis_id, check_key)
);

comment on table public.pillar_findings is
  'One row per distinct Performance/Accessibility/Security problem or opportunity found by one crawl_analyses run, pre-aggregated across every affected page. Shared across all three pillars (discriminated by `pillar`) -- see this migration''s own header comment for why, unlike every other category engine''s own dedicated table pair.';

create index pillar_findings_analysis on public.pillar_findings (crawl_analysis_id);
create index pillar_findings_website_pillar_severity on public.pillar_findings (website_id, pillar, severity);

alter table public.pillar_findings enable row level security;

revoke all on public.pillar_findings from public, anon, authenticated;

grant select on public.pillar_findings to authenticated;

create policy "pillar_findings_select_own" on public.pillar_findings
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = pillar_findings.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- pillar_finding_pages — the affected page evidence backing one finding.
-- ---------------------------------------------------------------------------

create table public.pillar_finding_pages (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.pillar_findings(id) on delete cascade,
  crawl_page_id uuid references public.crawl_pages(id) on delete set null,
  url text not null,
  affected_resource_url text,
  current_state jsonb,
  desired_state jsonb,
  proposed_change text,
  remediation_type text,
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint pillar_finding_pages_remediation_type_check
    check (remediation_type is null or remediation_type in (
      'url_replacement', 'directive_change', 'canonical_change',
      'sitemap_correction', 'robots_correction', 'schema_correction',
      'link_restructure', 'guided_instruction', 'content_field_replacement'
    ))
);

comment on table public.pillar_finding_pages is
  'Per-page evidence for one pillar_findings row. Bounded implicitly by the crawl''s own page budget, exactly like on_page_finding_pages/architecture_finding_pages.';

create unique index pillar_finding_pages_finding_url_target_unique
  on public.pillar_finding_pages (finding_id, url, coalesce(affected_resource_url, ''));

create index pillar_finding_pages_finding on public.pillar_finding_pages (finding_id);

alter table public.pillar_finding_pages enable row level security;

revoke all on public.pillar_finding_pages from public, anon, authenticated;

grant select on public.pillar_finding_pages to authenticated;

create policy "pillar_finding_pages_select_own" on public.pillar_finding_pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pillar_findings
      join public.websites on websites.id = pillar_findings.website_id
      where pillar_findings.id = pillar_finding_pages.finding_id and websites.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `drop table if exists public.pillar_finding_pages;
--  drop table if exists public.pillar_findings;
--  alter table public.crawl_pages drop column if exists performance_evidence;
--  alter table public.crawl_pages drop column if exists accessibility_evidence;
--  alter table public.crawl_pages drop column if exists security_evidence;`
-- — safe at any point; nothing outside this pass's own code reads these
-- tables/columns, and no existing row/column elsewhere is touched.
