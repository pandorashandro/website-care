import type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence } from '@/lib/category-engine/types'
import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'
import type { PillarCoverage } from './coverage'

export type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence }

/**
 * Unified webioom engine, Prompt 2 — shared vocabulary for the three new
 * canonical pillar engines (Performance, Accessibility, Security). See
 * supabase/migrations/20261111000000_pillar_findings.sql's own header
 * comment for why these three (and ONLY these three, introduced together in
 * one pass) share one persistence schema and this one TypeScript module,
 * unlike every earlier category engine's own dedicated types.ts.
 *
 * `checkKey`/`category` are deliberately plain `string` here (not a closed
 * union per pillar) — a real, disclosed simplification for delivery speed
 * in this pass, not a loss of correctness: each pillar's own checks/*.ts
 * file is still the single source of truth for which keys it produces, and
 * `actionability` is assigned directly by the check that produces a finding
 * (not looked up from a separate static map file) for the same reason.
 */
export type PillarKey = 'performance' | 'accessibility' | 'security'

export type FindingScope = 'page' | 'site'

/** PROBLEM vs OPPORTUNITY — the same distinction Content Intelligence established: only 'problem' findings ever enter the health-score deduction; 'opportunity' findings are fully persisted/displayed but never reduce score. */
export type FindingKind = 'problem' | 'opportunity'

/** No pillar check in this pass emits anything but 'deterministic' — the schema supports 'ai_interpreted'/'hybrid' from day one (matching every other engine's own future-proofing) but none is used yet. */
export type EvidenceSource = 'deterministic' | 'ai_interpreted' | 'hybrid'

export type RawFinding = {
  checkKey: string
  category: string
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
  actionability: Actionability
  estimatedImpact?: ImpactLevel | null
  effort?: ImpactLevel | null
  risk?: ImpactLevel | null
}

export type AggregatedFinding = {
  checkKey: string
  category: string
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

export type PillarFindingRow = {
  id: string
  crawl_analysis_id: string
  crawl_run_id: string
  website_id: string
  pillar: PillarKey
  check_key: string
  category: string
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

export type PillarFindingPageRow = {
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
 * Evidence-aware health scoring (2026-09-22) — mirrors lib/on-page/types.ts's
 * own `OnPageAnalysisRow` pattern: `coverage` is read from crawl_analyses'
 * existing generic, nullable column (see lib/pillars/coverage.ts's own doc
 * comment). NULL for every analysis persisted before this fix shipped.
 */
export type PillarAnalysisRow = CrawlAnalysisRow & { coverage: PillarCoverage | null }

export const PERFORMANCE_ANALYZER_VERSION = 'performance-v1'
export const ACCESSIBILITY_ANALYZER_VERSION = 'accessibility-v1'
export const SECURITY_ANALYZER_VERSION = 'security-v1'
