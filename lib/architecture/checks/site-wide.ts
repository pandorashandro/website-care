import type { CrawlEvidence } from '@/lib/crawler/evidence'
import { inboundCount, isHomepage } from '../graph'
import { isArchitectureEligiblePage } from '../eligibility'
import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 27, Checkpoint C.7 — site-wide graph signals.
 *
 * Deliberately narrow: this phase implements only the ONE deterministic,
 * clearly-defensible site-wide pattern — a large share of crawled pages
 * having zero internal inbound links. Genuine "weakly connected sections"/
 * clustering analysis (grouping pages into structural sections and
 * reasoning about which sections are under-connected to each other) is NOT
 * implemented — it would require a clustering or community-detection
 * approach this phase has not built or validated, and this phase's own
 * instructions explicitly forbid faking that kind of "architecture
 * quality" claim. See docs/site-architecture-engine.md's "Deferred" section.
 *
 * Suppressed on a partial crawl (depends on orphan detection, which is
 * itself suppressed then) and requires a minimum sample size so a small
 * site with one or two genuinely isolated pages is never misread as a
 * systemic pattern.
 *
 * Real-world evidence-quality pass: the population this check measures
 * isolation OVER is now `isArchitectureEligiblePage` pages, matching
 * orphan.ts's own population exactly (see eligibility.ts) — a batch of
 * utility/template resources that all happen to lack inbound links should
 * not be able to either manufacture a false "widespread isolation" pattern
 * or dilute a genuine one.
 *
 * SEVERITY SCALES WITH THE ISOLATION RATIO (Phase 27 score-calibration
 * audit correction): this is a `scope: 'site'` finding, so
 * lib/architecture/health.ts's page/occurrence spread multiplier never
 * applies to it (site-scoped findings always use spread = 1 — see that
 * module's own doc comment) and it has no `affectedPages` entries for the
 * shared severity-escalation rule (lib/category-engine/severity.ts) to act
 * on either. Without baseSeverity itself reflecting the ratio, 21%
 * isolated and 95% isolated would score IDENTICALLY, which the audit
 * identified as indefensible — a site that is almost entirely disconnected
 * is a categorically worse problem than one that just crossed the
 * reporting threshold.
 */
const MIN_PAGES_FOR_PATTERN = 5
const ISOLATED_FRACTION_THRESHOLD = 0.2
const SEVERE_ISOLATED_FRACTION_THRESHOLD = 0.5

export function analyzeSiteWideConsistency(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  if (context.isPartialCrawl) return []

  const eligible = evidence.pages.filter((page) => isArchitectureEligiblePage(page))
  const isolated = eligible.filter((page) => !isHomepage(context.graph, page.url) && inboundCount(context.graph, page.url) === 0)
  const isolatedFraction = isolated.length / eligible.length

  if (eligible.length < MIN_PAGES_FOR_PATTERN || isolatedFraction < ISOLATED_FRACTION_THRESHOLD) {
    return []
  }

  return [
    {
      checkKey: 'widespread_isolated_pages',
      category: 'site_wide_consistency',
      scope: 'site',
      baseSeverity: isolatedFraction >= SEVERE_ISOLATED_FRACTION_THRESHOLD ? 'critical' : 'high',
      confidence: 'medium',
      title: 'A large share of your site has no internal links pointing to it',
      explanation: `${isolated.length} of ${eligible.length} pages webioom crawled (${Math.round((isolated.length / eligible.length) * 100)}%) have no internal links from any other crawled page.`,
      whyItMatters: 'When a large portion of a site is not linked internally, it usually points to a systemic navigation or template issue rather than isolated one-off pages.',
      recommendation: 'Review your site\'s navigation structure and templates for a pattern that is leaving many pages unlinked (e.g. a category or archive listing that isn\'t rendering links, or pages only ever added to a sitemap without corresponding navigation).',
      evidence: { isolatedCount: isolated.length, eligibleCount: eligible.length },
      affectedPages: [],
    },
  ]
}
