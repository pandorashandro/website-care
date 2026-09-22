import type { CrawlPageRow, CrawlRunRow } from '@/lib/crawler/types'
import { isSuccessfulHtmlFetch } from '@/lib/category-engine/eligibility'

/**
 * Evidence-aware health scoring (2026-09-22). Technical SEO is structurally
 * different from every other engine's coverage model: several of its
 * checks (crawlability's 4xx/5xx/fetch-failed findings, robots.ts, sitemap.ts)
 * have REAL evidence from crawl-transport-level facts (an HTTP status code,
 * a crawl-time robots.txt/sitemap fetch outcome) that remains valid even
 * when zero pages were successfully fetched as real 2xx HTML content — a
 * page returning 403 IS itself a genuine crawlability fact, not something
 * that needs "eligible content" to observe. Only the CONTENT-DEPENDENT
 * checks (indexability's noindex signals, canonicals, structured data,
 * hreflang — see those check files' own doc comments) require a real 2xx
 * HTML fetch, which is why THOSE were fixed to gate on
 * `isSuccessfulHtmlFetch` rather than merely `status === 'completed'`.
 *
 * Coverage here therefore tracks TWO populations, not one:
 *   - `completedPageCount` — every page that got ANY response at all
 *     (regardless of status code), the population crawlability/robots/
 *     sitemap/redirects/site-wide findings can draw real evidence from.
 *   - `eligiblePageCount` — pages that were a genuine 2xx HTML fetch, the
 *     population indexability/canonicals/structured-data/hreflang findings
 *     can draw real evidence from.
 *
 * `level: 'none'` (zero evidence of ANY kind — the crawl reached nothing at
 * all) is the only case that overrides the persisted score to "not
 * assessed" (see technical-seo-summary.ts) — `'low'` (some pages
 * responded, but none were usable real content) still allows a genuine,
 * evidence-backed score built from crawlability/robots/sitemap findings.
 */

export type TechnicalSeoCoverageLevel = 'none' | 'low' | 'adequate'

export type TechnicalSeoCoverage = {
  eligiblePageCount: number
  completedPageCount: number
  robotsStatus: CrawlRunRow['robots_status']
  sitemapStatus: CrawlRunRow['sitemap_status']
  level: TechnicalSeoCoverageLevel
}

export function computeTechnicalSeoCoverage(pages: CrawlPageRow[], crawlRun: Pick<CrawlRunRow, 'robots_status' | 'sitemap_status'>): TechnicalSeoCoverage {
  const completedPageCount = pages.filter((page) => page.status === 'completed').length
  const eligiblePageCount = pages.filter(isSuccessfulHtmlFetch).length

  const level: TechnicalSeoCoverageLevel = completedPageCount === 0 ? 'none' : eligiblePageCount === 0 ? 'low' : 'adequate'

  return {
    eligiblePageCount,
    completedPageCount,
    robotsStatus: crawlRun.robots_status,
    sitemapStatus: crawlRun.sitemap_status,
    level,
  }
}
