import type { CrawlEvidence } from '../evidence'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category I — site-wide technical consistency. Reads raw
 * crawl_pages evidence directly (not other analyzers' findings) to surface
 * PATTERNS across the crawl as their own site-scoped findings, distinct
 * from — and with different, deliberately higher thresholds/lower overlap
 * than — robots.ts's own narrower "robots.txt specifically appears to
 * block ~everything" check (that one is about robots.txt specifically;
 * these are about the OVERALL indexability/reachability picture regardless
 * of cause).
 *
 * Minimum page counts exist so a tiny crawl (e.g. a 2-page site with one
 * genuinely noindex page) never gets flagged as a "widespread" problem —
 * that would be severity inflation from a sample too small to mean
 * anything.
 */
const MIN_PAGES_FOR_PATTERN = 5
const NON_INDEXABLE_FRACTION_THRESHOLD = 0.3
const FETCH_FAILURE_FRACTION_THRESHOLD = 0.2

export function analyzeSiteWideConsistency(evidence: CrawlEvidence): RawFinding[] {
  const findings: RawFinding[] = []

  const completed = evidence.pages.filter((page) => page.status === 'completed')
  const nonIndexable = completed.filter((page) => page.noindex === true || page.robots_allowed === false)

  if (completed.length >= MIN_PAGES_FOR_PATTERN && nonIndexable.length / completed.length >= NON_INDEXABLE_FRACTION_THRESHOLD) {
    findings.push({
      checkKey: 'widespread_non_indexable_pages',
      category: 'site_wide_consistency',
      scope: 'site',
      baseSeverity: 'high',
      confidence: 'medium',
      title: 'A large share of your crawled pages are not indexable',
      explanation: `${nonIndexable.length} of ${completed.length} pages webioom crawled (${Math.round((nonIndexable.length / completed.length) * 100)}%) are excluded from indexing by a noindex directive or robots.txt.`,
      whyItMatters: 'When a large portion of a site cannot be indexed, it usually points to a systemic template, plugin, or configuration issue rather than isolated one-off pages.',
      recommendation: 'Review your indexability settings (theme/plugin noindex defaults, robots.txt rules) for a pattern affecting many pages at once.',
      evidence: { nonIndexableCount: nonIndexable.length, completedCount: completed.length },
      affectedPages: [],
    })
  }

  const totalAttempted = evidence.pages.filter((page) => page.status === 'completed' || page.status === 'failed')
  const fetchFailed = totalAttempted.filter((page) => page.status === 'failed')

  if (totalAttempted.length >= MIN_PAGES_FOR_PATTERN && fetchFailed.length / totalAttempted.length >= FETCH_FAILURE_FRACTION_THRESHOLD) {
    findings.push({
      checkKey: 'widespread_fetch_failures',
      category: 'site_wide_consistency',
      scope: 'site',
      baseSeverity: 'critical',
      confidence: 'medium',
      title: 'A large share of your site could not be reached',
      explanation: `${fetchFailed.length} of ${totalAttempted.length} pages webioom attempted (${Math.round((fetchFailed.length / totalAttempted.length) * 100)}%) could not be fetched at all.`,
      whyItMatters: 'A high failure rate across many pages usually indicates a hosting, DNS, or server-wide problem rather than isolated broken pages.',
      recommendation: 'Check your hosting/server health — a high failure rate across many pages during one crawl usually shares a common cause.',
      evidence: { fetchFailedCount: fetchFailed.length, attemptedCount: totalAttempted.length },
      affectedPages: [],
    })
  }

  return findings
}
