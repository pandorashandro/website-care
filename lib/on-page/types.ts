import type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence } from '@/lib/category-engine/types'
import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'
import type { OnPageAnalysisCoverage } from './coverage'

export type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence }

/** 'page' for every current On-Page check (all V1 findings are ultimately about a set of pages, never a single whole-site statistic) — kept as its own type rather than hardcoding the literal, mirroring lib/architecture/types.ts's own FindingScope for forward-compatibility with a possible future site-scoped check. */
export type FindingScope = 'page' | 'site'

/**
 * Phase 28 — On-Page SEO vocabulary. Types only, mirroring
 * lib/architecture/types.ts's own convention. These names track
 * supabase/migrations/20261014000000_on_page_findings.sql's CHECK
 * constraints exactly — if either drifts, update both together.
 *
 * A SEPARATE category vocabulary from both Technical SEO (crawlability/
 * indexability mechanics) and Site Architecture (page-to-page relationships)
 * — On-Page SEO answers "is this individual page properly optimized for its
 * own search presentation" (title/meta description/heading quality). See
 * docs/on-page-seo-engine.md's "Category boundary" section for the full
 * classification, including which legacy scanner checks belong here versus
 * elsewhere (docs/technical-seo-legacy-classification.md already made this
 * classification machine-checkable in Phase 26B; this file implements the
 * ON_PAGE_SEO subset of it natively for the first time).
 */
export type FindingCategory = 'title' | 'meta_description' | 'headings'

/**
 * Stable identifier for each implemented check. Deliberately a closed
 * union: a new check requires an explicit addition here, to
 * CHECK_ACTIONABILITY (actionability.ts), and to the migration's
 * on_page_findings_analysis_check_key_unique-compatible set.
 */
export type CheckKey =
  // Title
  | 'missing_title'
  | 'title_too_short'
  | 'title_too_long'
  | 'weak_title'
  | 'duplicate_title'
  // Meta description
  | 'missing_meta_description'
  | 'meta_description_too_short'
  | 'meta_description_too_long'
  | 'duplicate_meta_description'
  // Headings
  | 'missing_h1'
  | 'multiple_h1'

/**
 * One analyzer's output before aggregation/severity-adjustment/persistence.
 * Identical shape to Technical SEO's/Site Architecture's own RawFinding —
 * kept as a parallel type rather than a shared generic for the same reason
 * lib/architecture/types.ts documents: CheckKey/FindingCategory differ per
 * engine, the FIELDS and their meaning are intentionally identical.
 */
export type RawFinding = {
  checkKey: CheckKey
  category: FindingCategory
  scope: FindingScope
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

export type OnPageFindingRow = {
  id: string
  crawl_analysis_id: string
  crawl_run_id: string
  website_id: string
  check_key: string
  category: FindingCategory
  scope: FindingScope
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

export type OnPageFindingPageRow = {
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
 * Reuses crawl_analyses AS-IS, exactly like Site Architecture — an On-Page
 * SEO analysis is simply a crawl_analyses row with this analyzer_version.
 *
 * Starts at v1, NOT an arbitrarily higher number: this is the first-ever
 * canonical On-Page SEO analyzer version. The pre-existing legacy scanner
 * (lib/scanner/) never had an "on-page-vN" lineage of its own — it is a
 * completely separate, unversioned system (lib/scanner/issue-definitions.ts's
 * generic `type: 'seo'` bucket) that this canonical engine supersedes for
 * the ON_PAGE_SEO-classified subset of checks (see
 * docs/technical-seo-legacy-classification.md), not a predecessor version to
 * increment from. Mirrors Technical SEO's own 'technical-v1' and Site
 * Architecture's own 'site-architecture-v1' precedent (both started at v1,
 * not v2, for the identical reason).
 */
export const ANALYZER_VERSION = 'on-page-v1'

/**
 * Founder-reported bug (2026-09-22) — mirrors lib/content/types.ts's own
 * `ContentAnalysisRow` pattern exactly: `coverage` is read from
 * crawl_analyses' existing generic, nullable column (see
 * lib/on-page/coverage.ts's own doc comment). NULL for every analysis
 * persisted before this fix shipped — callers must treat that as "unknown,
 * legacy" and fall back to the pre-fix presentation, never assume 'none'/0.
 */
export type OnPageAnalysisRow = CrawlAnalysisRow & { coverage: OnPageAnalysisCoverage | null }
