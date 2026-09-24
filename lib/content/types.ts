import type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence } from '@/lib/category-engine/types'
import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'
import type { ContentAnalysisCoverage } from './coverage'

export type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence }

/**
 * Phase 29 — Content Intelligence vocabulary. Types only, mirroring
 * lib/on-page/types.ts's own convention. Tracks
 * supabase/migrations/20261021000000_content_findings.sql's and
 * 20261028000000_content_v2_dimensions.sql's CHECK constraints exactly — if
 * either drifts, update both together.
 *
 * Answers "does this page contain useful, sufficiently complete, clear and
 * differentiated content for its apparent purpose" — distinct from On-Page
 * SEO (title/meta/heading PRESENCE and length, never substance) and Site
 * Architecture (page-to-page relationships, never what a page actually
 * says). See docs/content-intelligence-engine.md's "Category boundary".
 *
 * Maps onto the 12 canonical Content Intelligence report dimensions:
 * thinness=Content Depth, duplication=Duplicate Content + Repetitive/
 * Boilerplate Content, structure=Content Structure, faq=FAQ/Question
 * Coverage, page_purpose=Page Purpose. `completeness` is RESERVED for the
 * Content Completeness dimension but no check currently emits it (see
 * lib/content/dimensions.ts — it is reported as an honest "not assessed"
 * status, never a fabricated finding). Content Quality & Clarity, Topical
 * Coverage, Content Differentiation (beyond exact/repetitive overlap), and
 * Content Freshness have NO corresponding category at all — they are
 * represented purely as dimension statuses (some derived from existing
 * duplication findings, most "not assessed"), never as their own findings.
 */
export type FindingCategory = 'thinness' | 'duplication' | 'structure' | 'completeness' | 'faq' | 'page_purpose'

export type FindingScope = 'page' | 'site'

/**
 * PROBLEM vs OPPORTUNITY (this phase's own core product distinction):
 * a 'problem' is evidence-backed CONTENT HEALTH degradation and enters the
 * score's deduction formula; an 'opportunity' is a suggested improvement to
 * already-valid content and NEVER enters the deduction formula, regardless
 * of its severity/confidence fields (which still exist, for display/sort
 * priority only) — see lib/content/health.ts's own doc comment.
 */
export type FindingKind = 'problem' | 'opportunity'

/**
 * DETERMINISTIC evidence must remain separate from AI INTERPRETATION (this
 * phase's own explicit instruction) — every finding declares which it is.
 * No check in this initial implementation emits 'ai_interpreted' or
 * 'hybrid' (Phase 29 implements the deterministic foundation only — see
 * docs/content-intelligence-engine.md's "AI architecture" section for why
 * live AI interpretation was deliberately deferred), but the schema
 * supports all three from day one so adding an AI-derived check later needs
 * no migration and no finding-model change.
 */
export type EvidenceSource = 'deterministic' | 'ai_interpreted' | 'hybrid'

/**
 * Stable identifier for each implemented check. Deliberately a closed
 * union: a new check requires an explicit addition here, to
 * CHECK_ACTIONABILITY (actionability.ts), CHECK_KIND/CHECK_EVIDENCE_SOURCE
 * (health.ts), and the migration's
 * content_findings_analysis_check_key_unique-compatible set.
 */
export type CheckKey =
  | 'substantively_thin_page'
  | 'exact_duplicate_content'
  | 'highly_repetitive_page'
  | 'weak_content_structure'
  | 'faq_opportunity'
  | 'page_purpose_summary'
  /**
   * AI-interpreted Content Completeness (lib/content/ai/
   * completeness-interpretation.ts + lib/content/checks/completeness-ai.ts)
   * — built and tested, NOT invoked by the default production pipeline
   * (see lib/content/run-analysis.ts's own doc comment). Split into two
   * separate check keys, never one, because aggregate.ts groups raw
   * instances by checkKey and takes ONE `kind` for the whole aggregated
   * finding — a single checkKey could never safely carry both
   * score-affecting 'problem' instances and zero-impact 'opportunity'
   * instances at once.
   */
  | 'content_completeness_gap'
  | 'content_completeness_opportunity'

export type RawFinding = {
  checkKey: CheckKey
  category: FindingCategory
  scope: FindingScope
  kind: FindingKind
  evidenceSource: EvidenceSource
  baseSeverity: Severity
  confidence: Confidence
  title: string
  explanation: string
  whyItMatters: string
  recommendation: string
  evidence: Record<string, unknown>
  affectedPages: RawFindingPageEvidence[]
  estimatedImpact?: ImpactLevel | null
  effort?: ImpactLevel | null
  risk?: ImpactLevel | null
}

export type AggregatedFinding = {
  checkKey: CheckKey
  category: FindingCategory
  scope: FindingScope
  kind: FindingKind
  evidenceSource: EvidenceSource
  severity: Severity
  confidence: Confidence
  title: string
  explanation: string
  whyItMatters: string
  recommendation: string
  evidence: Record<string, unknown>
  affectedPages: RawFindingPageEvidence[]
  affectedPageCount: number
  occurrenceCount: number
  uniqueTargetCount: number
  actionability: Actionability
  estimatedImpact: ImpactLevel | null
  effort: ImpactLevel | null
  risk: ImpactLevel | null
}

export type ContentFindingRow = {
  id: string
  crawl_analysis_id: string
  crawl_run_id: string
  website_id: string
  check_key: string
  category: FindingCategory
  scope: FindingScope
  finding_kind: FindingKind
  evidence_source: EvidenceSource
  severity: Severity
  confidence: Confidence
  title: string
  explanation: string
  why_it_matters: string
  recommendation: string
  evidence: Record<string, unknown>
  affected_page_count: number
  occurrence_count: number
  unique_target_count: number
  actionability: Actionability
  estimated_impact: ImpactLevel | null
  effort: ImpactLevel | null
  risk: ImpactLevel | null
  analyzer_version: string
  created_at: string
}

export type ContentFindingPageRow = {
  id: string
  finding_id: string
  crawl_page_id: string | null
  url: string
  affected_resource_url: string | null
  current_state: StateValue | null
  desired_state: StateValue | null
  proposed_change: string | null
  remediation_type: RemediationType | null
  detail: Record<string, unknown> | null
}

/**
 * Reuses crawl_analyses AS-IS, exactly like Site Architecture/On-Page SEO —
 * plus ONE new, generic, nullable `coverage` column (see
 * supabase/migrations/20261104000000_content_analysis_coverage.sql and
 * lib/content/coverage.ts) that only Content Intelligence currently
 * populates.
 *
 * Bumped v2 -> v3 by the Phase 29 TARGETED COMPLETION pass: Page Purpose
 * now classifies service/product/article/about/category pages (previously
 * always 'unknown'), FAQ opportunity detection changed (fixed a
 * demonstrated CTA-question false negative; excludes contact pages),
 * Content Structure gained a second detection condition (long content with
 * zero headings, not just the extreme wall-of-text case), Duplicate
 * Content's clean-state dimension status changed from 'healthy' to
 * 'limited_confidence' (honest about exact-hash-only scope), Content
 * Completeness AI is now LIVE in the default production pipeline (was
 * previously never invoked), and a new Content Analysis Coverage record is
 * computed and persisted. A health_score/finding set/dimension report
 * computed under v2 no longer means the same thing as one computed under
 * v3 for identical crawl evidence. Mirrors every prior category engine's
 * own version-bump precedent exactly: any existing v2 row is left
 * untouched as dormant history; a website with a v2 analysis needs a fresh
 * re-analysis (NOT necessarily a fresh crawl — see this module's own
 * "re-analysis vs fresh crawl" note below) before its Content report
 * reflects the corrected model.
 *
 * RE-ANALYSIS VS FRESH CRAWL: every change in this version bump operates on
 * ALREADY-PERSISTED crawl_pages evidence (page-purpose classification, FAQ/
 * structure/duplicate check logic, AI completeness, coverage) — none of it
 * requires new crawl-time extraction, so a Content Re-analyze action alone
 * is sufficient to get a v3 result for an existing crawl_run. The ONE
 * exception is the chrome-exclusion extraction fix (ARIA-landmark roles,
 * WCAG skip-links — see lib/scanner/checks.ts's getSubstantiveBlocks): that
 * fix only affects HTML processed at CRAWL TIME, and raw HTML is never
 * persisted (see lib/crawler/content-extract.ts's own doc comment), so an
 * already-crawled page's stored content_text/content_word_count/content_hash
 * were computed with the OLD extraction logic and cannot be corrected by
 * re-analysis alone — only a FRESH CRAWL re-fetches and re-extracts each
 * page's HTML under the corrected extraction rules.
 *
 * v3 -> v4 (Scoring Engine V1 calibration, 2026-09-24): substantively_thin_page
 * now escalates to 'high' base severity when a page's word count is under
 * HALF its page-type's expected minimum (was a flat 'medium' regardless of
 * how extreme the shortfall was — see lib/content/checks/thin-content.ts's
 * own CRITICALLY_THIN_FRACTION doc comment). A health_score computed under
 * v3 for a critically thin page is HIGHER than what v4 would compute for
 * the identical evidence — the exact "stale score overstates quality"
 * direction this version bump exists to prevent (unlike this same pass's
 * ceiling-removal changes elsewhere, which only ever raise what a fresh
 * score CAN be and so were left unversioned as a defensible under-statement
 * rather than an overstatement). Operates entirely on already-persisted
 * crawl_pages evidence (word counts, page type) — a Content Re-analyze
 * action alone is sufficient to get a v4 result for an existing crawl_run,
 * no fresh crawl required.
 */
export const ANALYZER_VERSION = 'content-v4'

/** Content Intelligence's own extension of the shared CrawlAnalysisRow — adds the optional coverage record only Content currently populates. Every other category engine continues to use the base CrawlAnalysisRow type unchanged. */
export type ContentAnalysisRow = CrawlAnalysisRow & { coverage: ContentAnalysisCoverage | null }
