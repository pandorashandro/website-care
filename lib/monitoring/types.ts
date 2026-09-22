import type { FindingScope, FindingInstanceIdentity } from './fingerprint'

/**
 * Sprint 2, Prompt 1 — MONITORING FOUNDATION. The engine-agnostic shape
 * `lib/monitoring/compare.ts` operates on. Each of the 5 finding tables
 * (technical_findings, on_page_findings, architecture_findings,
 * content_findings, pillar_findings) maps onto this SAME shape — this
 * module never imports from, or knows about, any specific engine's own
 * table/type names; that mapping is the snapshot-fetching layer's job
 * (app/dashboard/websites/[id]/scan-history.ts), keeping this comparison
 * engine pure, deterministic, and fully unit-testable without Supabase.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low'

/** Mirrors every engine's own actionability union (see e.g. lib/on-page/types.ts) — repeated here only as a plain string type, never imported cross-engine, since this module must not depend on any one engine's types. */
export type Actionability = 'safe_fix' | 'prepared_fix' | 'guided_fix' | 'developer_required' | 'monitor'

export const CANONICAL_PILLARS = [
  'technical_seo',
  'on_page_seo',
  'content',
  'site_architecture',
  'performance',
  'accessibility',
  'security',
] as const

export type CanonicalPillar = (typeof CANONICAL_PILLARS)[number]

/** The one shared display label per canonical pillar — reused by the "Since last scan" card and the History page so both name pillars identically. */
export const CANONICAL_PILLAR_LABELS: Record<CanonicalPillar, string> = {
  technical_seo: 'Technical SEO',
  on_page_seo: 'On-Page SEO',
  content: 'Content',
  site_architecture: 'Site Architecture',
  performance: 'Performance',
  accessibility: 'Accessibility',
  security: 'Security',
}

/**
 * One finding as it existed in ONE scan — already resolved to a single,
 * scan-scoped fingerprint (see fingerprint.ts) by the snapshot builder.
 * `kind` mirrors the Problem/Opportunity split every engine already makes
 * (see lib/category-engine/health.ts and each engine's own aggregate.ts) —
 * opportunities are deliberately excluded from change comparison entirely
 * (see compare.ts's own doc comment), so this field exists only so the
 * snapshot builder can filter them out before this module ever sees them,
 * not for any decision compare.ts itself makes.
 */
export type SnapshotFinding = {
  fingerprint: string
  pillar: CanonicalPillar
  checkKey: string
  scope: FindingScope
  title: string
  severity: Severity
  actionability: Actionability
  /** The page this finding's fingerprint resolved against — used ONLY for coverage checking (was this page actually re-analyzed in the later snapshot), never for identity itself (fingerprint already encodes it). Null for a site-scoped finding, which has no single page to check coverage against. */
  instance: FindingInstanceIdentity | null
}

export type PillarCoverage =
  /** This pillar produced a real, persisted analysis for this scan, built from adequate evidence. */
  | 'analyzed'
  /** This pillar was not analyzed at all in this scan (e.g. a legacy scan predating a pillar's own launch, an isolated per-analyzer failure, or a crawl that reached zero eligible pages — see lib/category-engine/types.ts's CoverageLevel 'none'). */
  | 'not_analyzed'
  /**
   * Evidence-aware health scoring (2026-09-22) — a real, persisted analysis
   * exists (unlike 'not_analyzed'), but its own coverage record reports
   * 'low' (e.g. only 1 eligible page) — real evidence, just thin enough
   * that comparing it against another scan's score risks attributing a
   * coverage-driven swing (a website that suddenly has far fewer eligible
   * pages, e.g. because a firewall started blocking webioom) to an actual
   * website health change. `compare.ts`'s own `comparePillarScore`/
   * `wasCoveredIn` already treat anything other than the literal string
   * 'analyzed' as not-comparable, so this new value is additive and safe —
   * no change needed to that comparison logic itself.
   */
  | 'insufficient_data'

export type PillarSnapshot = {
  pillar: CanonicalPillar
  coverage: PillarCoverage
  /** Verbatim from the persisted crawl_analyses row — never recomputed. Null when coverage is 'not_analyzed'. */
  healthScore: number | null
  findings: SnapshotFinding[]
}

/**
 * A full, immutable, point-in-time record of ONE completed canonical scan
 * — never mutated once built, and never re-derived from anything except
 * already-persisted rows for that exact crawl_run_id (see this sprint's
 * own "a historical snapshot must never silently mutate" requirement).
 * `analyzedPageUrls` is the coverage evidence comparison needs: the exact
 * set of URLs this scan's crawl actually completed (crawl_pages.status =
 * 'completed'), so a page-scoped finding's disappearance can be told apart
 * from that page simply never having been re-crawled.
 */
export type CanonicalSnapshot = {
  crawlRunId: string
  websiteId: string
  completedAt: string | null
  /** True when the underlying crawl_run.status was 'partial' — surfaced so a comparison can flag reduced confidence, never hidden. */
  isPartialCrawl: boolean
  overallHealth: { score: number | null; contributingCategoryCount: number; totalCanonicalCategories: number }
  pillars: Record<CanonicalPillar, PillarSnapshot>
  /** Every URL this scan's crawl completed successfully — the coverage ground truth for page-scoped RESOLVED vs UNVERIFIED decisions. */
  analyzedPageUrls: Set<string>
}
