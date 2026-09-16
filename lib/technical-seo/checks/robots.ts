import type { CrawlEvidence } from '../evidence'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category E — robots.txt. Reads crawl_runs.robots_status (Phase
 * 26's own additive column, populated from the SAME robots.txt fetch
 * lib/crawler/engine.ts's startCrawlRun already performs — see that
 * column's own migration comment) plus crawl_pages.robots_allowed, which
 * Phase 25 already persisted per page.
 *
 * "robots_blocks_site" is inferred from the OBSERVED EFFECT across crawled
 * pages (most completed pages disallowed) rather than re-parsing robots.txt
 * a second time here — this is deliberately evidence-based (what actually
 * happened during the crawl), not a duplicate of check-robots.ts's own
 * sitewide-disallow-all text pattern match, and is why its confidence is
 * 'medium' rather than 'high': a real block is being inferred from effect,
 * not read directly off a parsed rule.
 */
const SITE_BLOCK_MIN_COMPLETED_PAGES = 2
const SITE_BLOCK_DISALLOWED_FRACTION = 0.9

export function analyzeRobots(evidence: CrawlEvidence): RawFinding[] {
  const findings: RawFinding[] = []

  if (evidence.crawlRun.robots_status === 'unreachable') {
    findings.push({
      checkKey: 'robots_unreachable',
      category: 'robots',
      scope: 'site',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'robots.txt could not be checked',
      explanation: 'webioom could not fetch robots.txt for your site during this crawl.',
      whyItMatters: 'Without a reachable robots.txt, webioom (and other crawlers) cannot confirm which parts of your site are meant to be crawled.',
      recommendation: 'Verify that /robots.txt is reachable and returns a normal response.',
      evidence: {},
      affectedPages: [],
    })
  }

  const completed = evidence.pages.filter((page) => page.status === 'completed')
  const disallowedCompleted = completed.filter((page) => page.robots_allowed === false)

  if (
    evidence.crawlRun.robots_status === 'ok' &&
    completed.length >= SITE_BLOCK_MIN_COMPLETED_PAGES &&
    disallowedCompleted.length / completed.length >= SITE_BLOCK_DISALLOWED_FRACTION
  ) {
    findings.push({
      checkKey: 'robots_blocks_site',
      category: 'robots',
      scope: 'site',
      baseSeverity: 'critical',
      confidence: 'medium',
      title: 'robots.txt appears to block most of your site',
      explanation: `${disallowedCompleted.length} of ${completed.length} pages webioom crawled were disallowed by robots.txt.`,
      whyItMatters: 'If this is not intentional, search engines may be blocked from crawling and indexing almost your entire site.',
      recommendation: 'Review robots.txt and confirm that blocking this much of your site is intentional. If not, remove the overly broad disallow rule.',
      evidence: { disallowedCount: disallowedCompleted.length, completedCount: completed.length },
      affectedPages: [],
    })
  }

  return findings
}
