-- Phase 29 — Content Intelligence: real-world evidence correction + the
-- complete 12-canonical-dimension report architecture (content-v2).
--
-- The original Phase 29 migration (20261021000000_content_findings.sql) has
-- ALREADY BEEN APPLIED and is NOT touched, reapplied, or modified here. This
-- is a new, additive, forward-only migration.
--
-- Two changes:
--
-- 1. crawl_pages: one new column, content_extraction_confidence. A fresh
--    Bespoke crawl proved the original `<p>`-only content extraction too
--    narrow (visibly populated page-builder pages extracted to 0
--    substantive words). The corrected extraction (lib/scanner/checks.ts's
--    getSubstantiveBlocks, block-level containers with <script>/<style>/
--    <nav>/<header>/<footer> excluded) is applied in code, not schema — but
--    it introduces ONE new evidence field: an explicit, persisted signal
--    for when extraction confidence is low (substantial raw visible text
--    exists but little of it landed in a substantive block), so "0
--    substantive words" is never silently read as proof a page is empty.
--
-- 2. content_findings: widens the `category` CHECK constraint to add 'faq'
--    and 'page_purpose' — two of the 12 canonical Content Intelligence
--    report dimensions this phase's own locked product requirement adds.
--    `faq_opportunity` (previously miscategorized under 'completeness',
--    which now correctly represents the SEPARATE, not-yet-assessed Content
--    Completeness dimension) moves to 'faq'. A new `page_purpose_summary`
--    finding (kind='opportunity', zero score impact -- Page Purpose is
--    intelligence used by other dimensions, never itself a health
--    deduction) uses 'page_purpose'. No existing row's `category` value
--    needs updating by this migration itself -- content_findings rows are
--    wholesale-replaced on every re-analysis (see
--    lib/content/supabase-store.ts's saveAnalysis), so the next analysis
--    run under analyzer_version = 'content-v2' naturally writes the
--    corrected category values; this migration only needs to widen the
--    constraint so those new values are accepted.
--
-- This migration does not depend on or alter
-- 20260927000000_technical_seo_findings.sql, 20260930000000_technical_seo_remediation.sql,
-- 20261007000000_site_architecture_findings.sql, 20261014000000_on_page_findings.sql,
-- or 20261021000000_content_findings.sql in any way.

-- ---------------------------------------------------------------------------
-- crawl_pages: content_extraction_confidence
-- ---------------------------------------------------------------------------

alter table public.crawl_pages
  add column content_extraction_confidence text not null default 'high';

alter table public.crawl_pages
  add constraint crawl_pages_content_extraction_confidence_check
    check (content_extraction_confidence in ('high', 'low'));

comment on column public.crawl_pages.content_extraction_confidence is
  'Computed once at crawl time (lib/crawler/content-extract.ts) by comparing the block-based substantive word count against the FULL raw visible-text word count for the same page. ''low'' means substantial raw visible text exists but almost none of it landed in a substantive content block -- evidence the block extraction likely missed this page''s real content structure, NOT evidence the page is empty. Must never be read as proof of thin/absent content; see lib/content/checks/thin-content.ts, which excludes ''low''-confidence pages from its own conclusion entirely rather than merely softening it.';

-- ---------------------------------------------------------------------------
-- content_findings: widen category to cover the FAQ / Question Coverage and
-- Page Purpose canonical dimensions.
-- ---------------------------------------------------------------------------

alter table public.content_findings
  drop constraint content_findings_category_check;

alter table public.content_findings
  add constraint content_findings_category_check
    check (category in ('thinness', 'duplication', 'structure', 'completeness', 'faq', 'page_purpose'));

comment on table public.content_findings is
  'One row per distinct Content Intelligence problem/opportunity found by one crawl_analyses run (analyzer_version = content-v2), pre-aggregated across every affected page/duplicate group. category now covers the canonical 12-dimension report (thinness=Content Depth, duplication=Duplicate+Repetitive Content, structure=Content Structure, completeness=Content Completeness [reserved, not yet assessed], faq=FAQ/Question Coverage, page_purpose=Page Purpose). Content Quality & Clarity, Topical Coverage, Content Differentiation (beyond exact/repetitive overlap), and Content Freshness are represented in the report as explicit NOT-ASSESSED dimension statuses (lib/content/dimensions.ts) rather than findings, since no reliable deterministic or persisted evidence exists for them yet -- see docs/content-intelligence-engine.md.';

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `alter table public.content_findings drop constraint content_findings_category_check;
--  alter table public.content_findings add constraint content_findings_category_check
--    check (category in ('thinness', 'duplication', 'structure', 'completeness'));
--  alter table public.crawl_pages drop constraint if exists crawl_pages_content_extraction_confidence_check;
--  alter table public.crawl_pages drop column if exists content_extraction_confidence;`
-- — safe at any point; no existing row's data is destroyed (only the
-- CHECK constraint and one additive column are touched), though any
-- content_findings row already persisted with category = 'faq' or
-- 'page_purpose' would need to be deleted or re-categorized before
-- reverting the constraint, since the OLD constraint would then reject
-- those rows' existing values.
