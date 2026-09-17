import type { IssueSeverity } from '@/lib/scanner/issue-definitions'

/**
 * Phase 27 — promoted from lib/technical-seo/types.ts (Phase 26/26B) once a
 * second category engine (lib/architecture/) needed the exact same
 * severity/confidence/actionability/remediation vocabulary. None of this
 * was ever Technical-SEO-specific in concept — it is the shared contract
 * every canonical category engine (Technical SEO, Site Architecture, and
 * eventually On-Page SEO/Content/Performance/Accessibility/Security)
 * builds its own findings on top of. lib/technical-seo/types.ts re-exports
 * these unchanged, so no existing Technical SEO import needed to change.
 */

/** Reused verbatim from the existing scanner's own severity vocabulary ("use/extend WEBIOOM's existing severity conventions rather than inventing an unrelated system"). */
export type Severity = IssueSeverity

export type Confidence = 'high' | 'medium' | 'low'

/**
 * The canonical, product-wide actionability vocabulary every category
 * engine uses. A category engine may only ever assign 'safe_fix'/
 * 'prepared_fix' when a REAL execution backend exists for that exact
 * change (see lib/fixes/fixability.ts/lib/integrations/ as the source of
 * truth for what currently exists) — never based on what would be nice to
 * automate later.
 */
export type Actionability = 'safe_fix' | 'prepared_fix' | 'guided_fix' | 'developer_required' | 'monitor'

/** Deliberately the same three-value vocabulary for impact/effort/risk — categorical, never fake numeric precision. */
export type ImpactLevel = 'high' | 'medium' | 'low'

/**
 * The kind of change a remediation instance represents. Generic on
 * purpose: not hardcoded to any one category's checks, reusable by every
 * category engine implemented now or later. Deliberately not exhaustive of
 * every possible future remediation — a new category engine can extend
 * this union as it needs new kinds of change, without altering the shape
 * around it.
 */
export type RemediationType =
  | 'url_replacement'
  | 'directive_change'
  | 'canonical_change'
  | 'sitemap_correction'
  | 'robots_correction'
  | 'schema_correction'
  | 'link_restructure'
  | 'guided_instruction'
  /** Phase 28 — a page's own title/meta-description/H1 text field being replaced with a new value (e.g. via the existing WordPress title/meta-description/H1 Prepare Fix flows). Added per this type's own "extend as needed" contract. */
  | 'content_field_replacement'

/** A single observed-or-desired state value, paired with a human-readable label so the UI never has to guess how to phrase a raw value. */
export type StateValue = {
  label: string
  value: string | null
}

/**
 * One concrete problem instance, generic enough to represent a page-level
 * defect (affectedResourceUrl null, `url` IS the affected resource) or a
 * relationship defect between two resources (e.g. a source page's internal
 * link and the broken/redirected target it points to). This is the
 * "evidence-first" shape: a check can express current state, desired
 * state, and a proposed change, not just prose.
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
 * Phase 26B correction — the reusable read-model shape a future Overview
 * "Category Health" card renders for ANY canonical category engine
 * (Technical SEO, and eventually On-Page SEO, Content, Site Architecture,
 * Performance, Accessibility, Security), without recomputing that
 * category's own analysis. Technical SEO (lib/technical-seo/) is the first
 * real implementation — see
 * app/dashboard/websites/[id]/technical-seo-summary.ts. Site Architecture
 * (lib/architecture/) is the second — see
 * app/dashboard/websites/[id]/site-architecture-summary.ts.
 *
 * Deliberately lean (per this correction's own "do not over-engineer"
 * instruction): only what Overview's existing Category Health tile
 * actually needs — a score/status pair, a finding count, partial-crawl
 * honesty, and enough version/timestamp metadata to know WHICH analysis
 * produced this summary. The full findings/evidence/remediation model
 * stays on the dedicated category page alone; it is never duplicated here.
 */
export type CategorySummaryStatus = 'not_analyzed' | 'analyzed'

export type CategorySummary = {
  categoryKey: string
  status: CategorySummaryStatus
  score: number | null
  findingsCount: number | null
  /** True when the underlying analysis covered only part of the site (e.g. a plan page-limit-truncated crawl) — never silently hidden from a summary view. */
  partial: boolean
  analyzedAt: string | null
  analyzerVersion: string | null
}
