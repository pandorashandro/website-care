-- Phase 26B — Canonical Technical SEO engine + remediation architecture.
--
-- The Phase 26A migration (20260927000000_technical_seo_findings.sql) HAS
-- been applied to the target Supabase project. This migration does NOT edit
-- that file or any object it created in a destructive way — it only adds
-- new columns, widens one CHECK constraint's allowed values, and replaces
-- one uniqueness rule that Phase 26B's richer evidence model requires (see
-- that section's own comment for exactly why and how it stays safe).
-- Nothing here drops a table, drops a column, or deletes a row.
--
-- Phase 26A's `crawl_analyses`/`technical_findings` rows (analyzer_version
-- = 'technical-v1') are left completely untouched — lib/technical-seo now
-- reads/writes 'technical-v2' exclusively (see types.ts's ANALYZER_VERSION),
-- so old rows simply become dormant history, not data this migration needs
-- to rewrite or migrate in place.

-- ---------------------------------------------------------------------------
-- crawl_analyses: persist the health score itself.
-- ---------------------------------------------------------------------------

-- Phase 26B's core fix for the "Technical = 62 vs 97" discrepancy: the
-- score is computed ONCE, at analysis time, and stored here — every reader
-- (Overview, the dedicated Technical SEO page) selects this same column
-- rather than ever recomputing it. See lib/technical-seo/health.ts.
alter table public.crawl_analyses
  add column health_score integer;

alter table public.crawl_analyses
  add constraint crawl_analyses_health_score_check
    check (health_score is null or (health_score >= 0 and health_score <= 100));

comment on column public.crawl_analyses.health_score is
  'The Technical SEO health score computed by lib/technical-seo/health.ts at analysis time. The ONE authoritative value for this analysis -- read verbatim by every UI surface, never recomputed. Null only for a ''running'' or ''failed'' analysis that never reached a computed score.';

-- ---------------------------------------------------------------------------
-- technical_findings: actionability vocabulary + distinct evidence counts.
-- ---------------------------------------------------------------------------

-- Phase 26A's `fixability` column/vocabulary is superseded by
-- `actionability` (Phase 26B, Checkpoint 7's canonical five-value
-- vocabulary: safe_fix / prepared_fix / guided_fix / developer_required /
-- monitor -- the exact wording future category engines will reuse). The old
-- column is left in place, unchanged, still NOT NULL for any EXISTING
-- (technical-v1) row -- nothing destroys that history. It is relaxed to
-- nullable here only so it stops being a required field for the NEW
-- (technical-v2) rows this phase's analyzer writes going forward, which
-- populate `actionability` instead and never touch `fixability` again.
alter table public.technical_findings
  alter column fixability drop not null;

comment on column public.technical_findings.fixability is
  'Phase 26A-only field, superseded by `actionability` (Phase 26B). Populated for technical-v1 rows (kept, unmodified, for history); left null on every technical-v2 row going forward -- see `actionability`.';

alter table public.technical_findings
  add column actionability text;

alter table public.technical_findings
  add constraint technical_findings_actionability_check
    check (actionability is null or actionability in ('safe_fix', 'prepared_fix', 'guided_fix', 'developer_required', 'monitor'));

comment on column public.technical_findings.actionability is
  'Phase 26B, Checkpoint 7 -- the canonical actionability classification every future category engine reuses. Null only for a technical-v1 (Phase 26A) row; always populated for technical-v2 rows.';

-- Checkpoint 9/10: a finding's affected count must distinguish DISTINCT
-- SOURCE PAGES (affected_page_count, already existed) from total
-- OCCURRENCES and DISTINCT AFFECTED TARGETS -- e.g. "19 internal link
-- occurrences, across 2 source pages, pointing at 3 unique redirecting
-- targets" is three different, equally true numbers that must never be
-- presented as if they were the same one.
alter table public.technical_findings
  add column occurrence_count integer not null default 0,
  add column unique_target_count integer not null default 0;

comment on column public.technical_findings.occurrence_count is
  'Total distinct (source page, affected resource) instances backing this finding -- may exceed affected_page_count when one source page has multiple distinct affected resources (e.g. two different broken links on the same page).';

comment on column public.technical_findings.unique_target_count is
  'Distinct non-null technical_finding_pages.affected_resource_url values for this finding -- 0 for checks with no separate "other resource" concept (a page-level defect where the affected resource IS the source page).';

-- Widen the category CHECK to include Phase 26B's two new check categories
-- (structured data, internationalization/hreflang) -- Postgres has no
-- "add value to existing CHECK" syntax, so the constraint is dropped and
-- recreated with the superset of allowed values; every value the OLD
-- constraint allowed remains allowed, so no existing row is invalidated.
alter table public.technical_findings drop constraint technical_findings_category_check;
alter table public.technical_findings
  add constraint technical_findings_category_check
    check (category in (
      'crawlability', 'indexability', 'canonicals', 'redirects', 'robots',
      'sitemap', 'url_protocol', 'technical_page', 'structured_data',
      'internationalization', 'site_wide_consistency'
    ));

-- ---------------------------------------------------------------------------
-- technical_finding_pages: typed current/desired state + remediation.
-- ---------------------------------------------------------------------------

alter table public.technical_finding_pages
  add column affected_resource_url text,
  add column current_state jsonb,
  add column desired_state jsonb,
  add column proposed_change text,
  add column remediation_type text;

alter table public.technical_finding_pages
  add constraint technical_finding_pages_remediation_type_check
    check (remediation_type is null or remediation_type in (
      'url_replacement', 'directive_change', 'canonical_change',
      'sitemap_correction', 'robots_correction', 'schema_correction',
      'guided_instruction'
    ));

comment on column public.technical_finding_pages.affected_resource_url is
  'The specific OTHER resource this instance is about, when different from `url` (e.g. a broken/redirected internal link''s target). Null when `url` itself is the affected resource -- see lib/technical-seo/types.ts''s RawFindingPageEvidence.';

comment on column public.technical_finding_pages.current_state is
  'Typed { label, value } describing what is observed right now for this instance -- see lib/technical-seo/types.ts''s StateValue. Null when a check has no single "current value" to state (rare; most instances populate this).';

comment on column public.technical_finding_pages.desired_state is
  'Typed { label, value } describing what the state should be, ONLY when deterministically knowable from this crawl''s own evidence -- never guessed. Null when no confident target exists.';

comment on column public.technical_finding_pages.proposed_change is
  'One-line, human-actionable instruction (e.g. "Replace the link to /old-url with /new-url"). Null when the instance is purely observational (see remediation_type null in that case too).';

-- Phase 26A's uniqueness rule (finding_id, url) assumed at most one
-- instance per (finding, source page) -- true for a page-level defect, but
-- Phase 26B's relationship-based checks (e.g. one source page linking to
-- TWO different broken targets) need two distinct rows sharing the same
-- (finding_id, url). Replaced with a uniqueness rule over
-- (finding_id, url, affected_resource_url) instead -- implemented as a
-- functional unique index (not a plain UNIQUE constraint) because Postgres
-- treats every NULL as distinct from every other NULL in an ordinary
-- UNIQUE constraint, which would silently stop deduplicating the common
-- page-level case (affected_resource_url always null): coalescing null to
-- '' first restores exact-duplicate protection for that case while still
-- allowing multiple distinct affected_resource_url values per (finding, url).
alter table public.technical_finding_pages drop constraint technical_finding_pages_finding_url_unique;
create unique index technical_finding_pages_finding_url_target_unique
  on public.technical_finding_pages (finding_id, url, coalesce(affected_resource_url, ''));

-- ---------------------------------------------------------------------------
-- crawl_pages: structured data + hreflang evidence (Phase 26B additive
-- extraction -- reuses the SAME already-fetched HTML the engine already
-- parses for title/canonical/etc.; no new network call, no crawler
-- redesign).
-- ---------------------------------------------------------------------------

alter table public.crawl_pages
  add column structured_data_present boolean not null default false,
  add column structured_data_valid boolean,
  add column structured_data_error text,
  add column hreflang_tags jsonb not null default '[]'::jsonb;

comment on column public.crawl_pages.structured_data_present is
  'True if this page contained at least one <script type="application/ld+json"> block.';

comment on column public.crawl_pages.structured_data_valid is
  'True if every JSON-LD block present parsed as valid JSON; false if at least one did not. Null when structured_data_present is false (no opinion to have). This is JSON-syntax validity only -- NOT schema.org semantic/Rich-Results validation, which webioom does not perform (see lib/technical-seo/checks/structured-data.ts''s own doc comment).';

comment on column public.crawl_pages.structured_data_error is
  'A short, human-readable description of the first JSON parse failure encountered, when structured_data_valid is false. Null otherwise.';

comment on column public.crawl_pages.hreflang_tags is
  'Array of { lang, href } extracted from this page''s <link rel="alternate" hreflang="..." href="..."> tags, href resolved to an absolute URL where possible (left as-authored if resolution fails). Empty array (the default) means no hreflang tags were found -- most sites will never populate this, which is expected and not itself a finding.';

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `alter table public.crawl_pages drop column if exists hreflang_tags;
--  alter table public.crawl_pages drop column if exists structured_data_error;
--  alter table public.crawl_pages drop column if exists structured_data_valid;
--  alter table public.crawl_pages drop column if exists structured_data_present;
--  drop index if exists public.technical_finding_pages_finding_url_target_unique;
--  alter table public.technical_finding_pages add constraint technical_finding_pages_finding_url_unique unique (finding_id, url);
--  alter table public.technical_finding_pages drop constraint if exists technical_finding_pages_remediation_type_check;
--  alter table public.technical_finding_pages drop column if exists remediation_type;
--  alter table public.technical_finding_pages drop column if exists proposed_change;
--  alter table public.technical_finding_pages drop column if exists desired_state;
--  alter table public.technical_finding_pages drop column if exists current_state;
--  alter table public.technical_finding_pages drop column if exists affected_resource_url;
--  alter table public.technical_findings drop constraint technical_findings_category_check;
--  alter table public.technical_findings add constraint technical_findings_category_check check (category in ('crawlability','indexability','canonicals','redirects','robots','sitemap','url_protocol','technical_page','site_wide_consistency'));
--  alter table public.technical_findings drop column if exists unique_target_count;
--  alter table public.technical_findings drop column if exists occurrence_count;
--  alter table public.technical_findings drop constraint if exists technical_findings_actionability_check;
--  alter table public.technical_findings drop column if exists actionability;
--  alter table public.crawl_analyses drop constraint if exists crawl_analyses_health_score_check;
--  alter table public.crawl_analyses drop column if exists health_score;`
-- — safe at any point; every technical-v1 (Phase 26A) row and every
-- crawl_runs/crawl_pages row created before this migration remains fully
-- intact and readable throughout (`fixability` is only relaxed to
-- nullable, never dropped or rewritten).
