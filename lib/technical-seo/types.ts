import type { IssueSeverity } from '@/lib/scanner/issue-definitions'

/**
 * Phase 26 — shared Technical SEO vocabulary. Types only, mirroring
 * lib/crawler/types.ts's own "types first, no premature abstraction"
 * convention. These names track supabase/migrations/20260927000000_technical_seo_findings.sql
 * and 20260930000000_technical_seo_remediation.sql's CHECK constraints
 * exactly — if either drifts, update both together.
 */

export type FindingCategory =
  | 'crawlability'
  | 'indexability'
  | 'canonicals'
  | 'redirects'
  | 'robots'
  | 'sitemap'
  | 'url_protocol'
  | 'technical_page'
  | 'structured_data'
  | 'internationalization'
  | 'site_wide_consistency'

export type FindingScope = 'page' | 'site'

/** Reused verbatim from the existing scanner's own severity vocabulary (Checkpoint 6, Phase 26A: "use/extend WEBIOOM's existing severity conventions rather than inventing an unrelated system"). */
export type Severity = IssueSeverity

export type Confidence = 'high' | 'medium' | 'low'

/**
 * Phase 26B, Checkpoint 7 — the canonical, product-wide actionability
 * vocabulary every future category engine (On-Page, Content, Architecture,
 * Performance, Accessibility, Security) will reuse. Renamed from Phase 26A's
 * own {safe_automatic, prepared_approval, guided_manual, developer_required,
 * informational_monitor} to this exact wording per Phase 26B's instructions
 * — same five-way concept, corrected vocabulary. As of this phase, no
 * Technical SEO check has a real automatic/prepared-fix backend (the
 * existing WordPress/Shopify/Wix fix capabilities only cover title/meta/H1/
 * image-alt), so no check in this library is classified 'safe_fix' or
 * 'prepared_fix' — see lib/technical-seo/actionability.ts. Phase 30 attaches
 * real executors later without needing to redesign this field.
 */
export type Actionability = 'safe_fix' | 'prepared_fix' | 'guided_fix' | 'developer_required' | 'monitor'

/** Deliberately the same three-value vocabulary for impact/effort/risk — categorical, never fake numeric precision. */
export type ImpactLevel = 'high' | 'medium' | 'low'

/**
 * Phase 26B, Checkpoint 6 — the kind of change a remediation instance
 * represents. Generic on purpose: not hardcoded to redirects, reusable by
 * every check category implemented now or later.
 */
export type RemediationType =
  | 'url_replacement'
  | 'directive_change'
  | 'canonical_change'
  | 'sitemap_correction'
  | 'robots_correction'
  | 'schema_correction'
  | 'guided_instruction'

/** A single observed-or-desired state value, paired with a human-readable label so the UI never has to guess how to phrase a raw value. */
export type StateValue = {
  label: string
  value: string | null
}

/**
 * Stable identifier for each implemented check — this, not title text, is
 * the durable identity a future export/prioritization engine (Phase 32/33)
 * or a re-run of analysis should key on. Deliberately a closed union: a new
 * check requires an explicit addition here, to CHECK_ACTIONABILITY
 * (actionability.ts), and to the migration's
 * technical_findings_analysis_check_key_unique-compatible set — nothing can
 * silently introduce an unrecognized key.
 */
export type CheckKey =
  // A. Crawlability / fetch health
  | 'fetch_failed'
  | 'redirect_loop_page'
  | 'excessive_redirect_chain'
  | 'internal_page_4xx'
  | 'internal_page_5xx'
  // B. Indexability
  | 'noindex_page'
  | 'indexable_page_blocked_by_robots'
  | 'conflicting_indexability_signals'
  | 'important_page_non_indexable'
  // C. Canonicals
  | 'missing_canonical'
  | 'invalid_canonical'
  | 'canonical_cross_domain'
  | 'canonical_http_downgrade'
  | 'canonical_target_error'
  | 'canonical_target_non_indexable'
  // D. Redirects
  | 'internal_link_to_redirected_url'
  | 'internal_link_to_broken_url'
  | 'https_downgrade_redirect'
  // E. Robots.txt
  | 'robots_unreachable'
  | 'robots_blocks_site'
  // F. XML sitemaps
  | 'sitemap_unavailable'
  | 'sitemap_empty'
  | 'sitemap_contains_error_url'
  | 'sitemap_contains_noindex_url'
  | 'sitemap_contains_blocked_url'
  | 'important_page_missing_from_sitemap'
  // G. URL / protocol health
  | 'mixed_protocol_internal_links'
  // H. Technical page signals
  | 'empty_or_tiny_page'
  // Structured data (Phase 26B)
  | 'structured_data_invalid'
  // Internationalization / hreflang (Phase 26B)
  | 'hreflang_invalid_code'
  | 'hreflang_target_error'
  | 'hreflang_missing_reciprocal'
  // I. Site-wide technical consistency
  | 'widespread_non_indexable_pages'
  | 'widespread_fetch_failures'

/**
 * Phase 26B, Checkpoint 6 — one concrete problem instance, generic enough
 * to represent a page-level defect (affectedResourceUrl null, `url` IS the
 * affected resource) or a relationship defect between two resources (e.g. a
 * source page's internal link and the broken/redirected target it points
 * to). This is the "evidence-first" upgrade: a check can now express
 * current state, desired state, and a proposed change, not just prose.
 */
export type RawFindingPageEvidence = {
  /** The page this instance is anchored to — for a page-level defect, the affected page itself; for a relationship defect (e.g. a broken internal link), the page CONTAINING the reference. */
  url: string
  /** The specific other resource the problem is actually about, when it differs from `url` (e.g. a broken/redirected link's target, or a canonical's target). Null when `url` itself is the affected resource. */
  affectedResourceUrl?: string | null
  /** What is observed right now, e.g. `{ label: 'Internal link points to', value: '/old-url (redirects, HTTP 301)' }`. */
  currentState?: StateValue | null
  /** What the state should be, when deterministically knowable from this crawl's own evidence. Null when no confident target exists (never guessed). */
  desiredState?: StateValue | null
  /** One-line actionable instruction, e.g. "Replace the link to /old-url with /new-url." Null when the instance is purely observational. */
  proposedChange?: string | null
  remediationType?: RemediationType | null
  /** Small, JSON-serializable, finding-specific detail for THIS instance. Never the full crawl_pages row — that already exists and is queryable by url/crawl_run_id. */
  detail?: Record<string, unknown>
}

/**
 * One analyzer's output before aggregation/severity-adjustment/persistence.
 * An analyzer emits one RawFinding instance PER AFFECTED occurrence for a
 * page-scoped check (aggregate.ts groups these into one persisted row per
 * checkKey — see its own doc comment) or a single RawFinding with scope
 * 'site' and no page-specific identity for a genuinely site-wide check.
 */
export type RawFinding = {
  checkKey: CheckKey
  category: FindingCategory
  scope: FindingScope
  /** The analyzer's own best-effort severity for THIS instance, before aggregate.ts's confidence/spread adjustment — see severity.ts's adjustSeverity. */
  baseSeverity: Severity
  confidence: Confidence
  title: string
  explanation: string
  whyItMatters: string
  recommendation: string
  /** Finding-level evidence (not per-instance) — e.g. `{ disallowRule: '/' }` for a site-wide robots block. */
  evidence: Record<string, unknown>
  affectedPages: RawFindingPageEvidence[]
  estimatedImpact?: ImpactLevel | null
  effort?: ImpactLevel | null
  risk?: ImpactLevel | null
}

/** A RawFinding after aggregation across all analyzer output for one analysis, ready to persist as one technical_findings row (+ its technical_finding_pages rows). */
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
  /** Distinct source pages among affectedPages (Checkpoint 9/10: never conflated with occurrence or unique-target counts). */
  affectedPageCount: number
  /** Total instances, after de-duplicating identical (url, affectedResourceUrl) pairs — may exceed affectedPageCount when one source page has multiple distinct affected resources. */
  occurrenceCount: number
  /** Distinct non-null affectedResourceUrl values among affectedPages — 0 for checks with no separate "other resource" (e.g. a page-level defect where affectedResourceUrl is always null). */
  uniqueTargetCount: number
  actionability: Actionability
  estimatedImpact: ImpactLevel | null
  effort: ImpactLevel | null
  risk: ImpactLevel | null
}

export type TechnicalFindingRow = {
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

export type TechnicalFindingPageRow = {
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

export type CrawlAnalysisStatus = 'running' | 'completed' | 'failed'

export type CrawlAnalysisRow = {
  id: string
  crawl_run_id: string
  website_id: string
  status: CrawlAnalysisStatus
  analyzer_version: string
  findings_count: number
  /** Phase 26B — the persisted Technical SEO health score for this analysis, computed once at analysis time and read verbatim everywhere it is displayed (Overview, the dedicated page) so the two can never diverge. See health.ts. */
  health_score: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

/**
 * The current analyzer's version tag — bumping this gives a re-analysis a
 * fresh crawl_analyses row (and fresh findings) instead of overwriting the
 * previous version's results, per the migration's own
 * (crawl_run_id, analyzer_version) uniqueness. Bumped for Phase 26B since
 * the finding shape itself changed (actionability vocabulary, remediation
 * fields, new checks) — a 26A-analyzer-version row and its findings are
 * left untouched (never migrated in place — see the Phase 26B migration's
 * own comment), and simply stop being the one the product reads.
 */
export const ANALYZER_VERSION = 'technical-v2'
