-- Phase 29 targeted completion pass — Content Analysis Coverage.
--
-- Both prior Content migrations (20261021000000_content_findings.sql and
-- 20261028000000_content_v2_dimensions.sql) have ALREADY BEEN APPLIED and
-- are NOT touched, reapplied, or modified here. This is a new, additive,
-- forward-only migration. DO NOT APPLY AUTOMATICALLY — apply manually after
-- review, exactly like every prior migration in this project.
--
-- WHAT THIS ADDS: one new, nullable, generic column on the SHARED
-- crawl_analyses table (used identically by Technical SEO, On-Page SEO,
-- Site Architecture, and Content Intelligence — see docs/category-engine-
-- contract.md's "one persisted analysis" architecture): `coverage jsonb`.
--
-- WHY crawl_analyses AND NOT A NEW TABLE: Content's own dedicated report
-- page already reads its `crawl_analyses` row for score/findings_count/
-- analyzer_version/timestamp (lib/content/store.ts's getLatestAnalysis) —
-- colocating coverage there means the SAME row that already anchors
-- "one authoritative persisted analysis" (this phase's own locked
-- architecture) also carries how much of that analysis is genuinely backed
-- by reliable evidence, with no new join, no new table, no risk of the two
-- ever drifting apart.
--
-- WHY NULLABLE AND GENERIC (not content-specific naming, not NOT NULL): no
-- other category engine populates this column today — every existing
-- Technical SEO / On-Page SEO / Site Architecture crawl_analyses row simply
-- leaves it NULL, exactly as if the column did not exist for them. The
-- column is deliberately named generically (not `content_coverage`) so any
-- FUTURE category engine that wants the same Health-vs-Coverage distinction
-- can adopt it without a further migration. This is the same additive,
-- nullable, harmless-to-other-consumers pattern already used throughout
-- this project (e.g. crawl_pages.h1_count, crawl_pages.content_word_count).
--
-- SHAPE (written by lib/content/supabase-store.ts, read by
-- lib/content/coverage.ts's own ContentAnalysisCoverage type — no CHECK
-- constraint enforces the shape at the database level, consistent with
-- every other jsonb evidence/detail column already in this schema, e.g.
-- content_findings.evidence):
--   {
--     "eligiblePageCount": number,
--     "highConfidenceExtractionCount": number,
--     "lowConfidenceExtractionCount": number,
--     "dimensionsAssessed": number,
--     "dimensionsTotal": number,
--     "percent": number,
--     "level": "high" | "medium" | "low"
--   }

alter table public.crawl_analyses
  add column coverage jsonb null;

comment on column public.crawl_analyses.coverage is
  'Optional, engine-specific "how much of the analysis is backed by reliable evidence" record -- a SEPARATE concept from health_score (see lib/content/coverage.ts). NULL for every analyzer that does not populate it (all current Technical SEO / On-Page SEO / Site Architecture rows, and any Content row from before this column existed). Only Content Intelligence (analyzer_version content-v3 and later) currently writes this.';

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `alter table public.crawl_analyses drop column if exists coverage;`
-- — safe at any point; no other column or existing row's data is touched.
-- A client reading a row from before this rollback simply stops seeing the
-- `coverage` field it already treats as optional.
