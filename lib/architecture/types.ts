import type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence } from '@/lib/category-engine/types'

export type { Severity, Confidence, Actionability, ImpactLevel, RemediationType, StateValue, RawFindingPageEvidence }

/**
 * Phase 27 — Site Architecture & Internal Linking vocabulary. Types only,
 * mirroring lib/technical-seo/types.ts's own convention. These names track
 * supabase/migrations/20261007000000_site_architecture_findings.sql's CHECK
 * constraints exactly — if either drifts, update both together.
 *
 * Deliberately a SEPARATE category vocabulary from Technical SEO's
 * FindingCategory — Site Architecture answers "how do pages connect,"
 * Technical SEO answers "can search engines crawl/index correctly." See
 * docs/site-architecture-engine.md's "Cross-category ownership" section for
 * the exact rule governing evidence relevant to both (e.g. an internal
 * link to a redirect/broken page).
 */
export type FindingCategory = 'orphan_pages' | 'link_depth' | 'internal_link_health' | 'link_distribution' | 'dead_ends' | 'link_opportunities' | 'site_wide_consistency'

export type FindingScope = 'page' | 'site'

/**
 * Stable identifier for each implemented check. Deliberately a closed
 * union: a new check requires an explicit addition here, to
 * CHECK_ACTIONABILITY (actionability.ts), and to the migration's
 * architecture_findings_analysis_check_key_unique-compatible set.
 */
export type CheckKey =
  // Orphan / isolated pages
  | 'orphan_page'
  // Link depth
  | 'deep_page'
  // Internal link health (redirect/broken edges — Site Architecture's own
  // graph-edge framing; see the cross-category ownership doc)
  | 'internal_link_to_redirect_edge'
  | 'internal_link_to_broken_edge'
  // Link distribution
  | 'underlinked_page'
  // Dead ends
  | 'dead_end_page'
  // Link opportunities (foundation only — see link-opportunities.ts; no
  // check currently emits this key, reserved for when real semantic
  // evidence exists)
  | 'internal_link_opportunity'
  // Site-wide
  | 'widespread_isolated_pages'

/**
 * One analyzer's output before aggregation/severity-adjustment/persistence.
 * Identical shape to Technical SEO's own RawFinding (see
 * lib/technical-seo/types.ts) — kept as a parallel type rather than a
 * shared generic because CheckKey/FindingCategory differ per engine; the
 * FIELDS and their meaning are intentionally identical.
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

export type ArchitectureFindingRow = {
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

export type ArchitectureFindingPageRow = {
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
 * Reuses crawl_analyses AS-IS (see the migration's own comment for why no
 * schema change was needed there) — Site Architecture analyses are simply
 * crawl_analyses rows with this analyzer_version, distinguished from
 * Technical SEO's 'technical-v2' rows purely by this string, exactly the
 * way the (crawl_run_id, analyzer_version) unique constraint already
 * intended multiple analyzer categories/versions to coexist.
 *
 * Bumped v1 -> v2 by the Phase 27 score-calibration audit (see
 * docs/site-architecture-engine.md's §13): the SCORING FORMULA itself
 * changed (occurrence-aware spread, severity-scaled widespread-isolation
 * check), so a health_score computed under v1 no longer means the same
 * thing as one computed under v2 for identical evidence. Mirrors Technical
 * SEO's own 'technical-v1' -> 'technical-v2' precedent (Phase 26B) exactly
 * — any existing v1 row is left untouched (never rewritten in place) and
 * simply becomes dormant history; the product reads v2 exclusively going
 * forward. A website with a v1 score on record needs a fresh analysis
 * before its Site Architecture number reflects the corrected model.
 *
 * Bumped v2 -> v3 by the real-world evidence-quality pass triggered by the
 * Bespoke website's 94/100 review (see docs/site-architecture-engine.md's
 * follow-up section): FINDING ELIGIBILITY changed — orphan_page,
 * underlinked_page, dead_end_page, deep_page, and widespread_isolated_pages
 * now require isArchitectureEligiblePage (lib/architecture/eligibility.ts),
 * so the exact same crawl evidence can now produce a different finding set
 * (and therefore a different health_score) than it did under v2, for sites
 * whose crawled pages include utility/template resources (e.g. WordPress
 * mega-menu query-string endpoints) that previously qualified as ordinary
 * content pages. Same rule as the v1 -> v2 bump: any existing v2 row is
 * left untouched as dormant history; a website with a v2 score needs a
 * fresh analysis before its Site Architecture number reflects the
 * corrected eligibility model.
 */
export const ANALYZER_VERSION = 'site-architecture-v3'
