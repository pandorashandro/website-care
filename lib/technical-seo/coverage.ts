import type { CrawlPageRow, CrawlRunRow } from '@/lib/crawler/types'
import { isSuccessfulHtmlFetch } from '@/lib/category-engine/eligibility'
import { computeSiteAccessState, type SiteAccessState } from '@/lib/category-engine/site-access'

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
 *
 * CORRECTION (2026-09-22, follow-up): the paragraph above was only half
 * right. `'low'` is defensible when a site genuinely has content that
 * happens to be non-2xx/noindex/etc — but it is NOT defensible when the
 * REASON eligiblePageCount is 0 is that webioom's own crawler was blocked
 * from the whole site (`computeSiteAccessState()` returns `'blocked'` or
 * `'fetch_failed'`). In that case, crawlability's own 4xx/5xx findings and
 * robots_unreachable/sitemap_unavailable are not three independent,
 * confirmed website defects — they are three symptoms of the SAME single
 * access-denial event (see lib/technical-seo/run-analysis.ts's own
 * SUPPRESSED_ON_ACCESS_FAILURE filter, which stops them from ever being
 * persisted as findings in this exact case). Reusing the SAME
 * computeSiteAccessState() the Overview banner already uses — never a
 * second, competing site-access model — `level` now resolves to `'none'`
 * whenever the crawl was blocked/fetch-failed, matching every other
 * canonical engine's own "zero genuine evidence" treatment exactly.
 */

export type TechnicalSeoCoverageLevel = 'none' | 'low' | 'adequate'

export type TechnicalSeoCoverage = {
  eligiblePageCount: number
  completedPageCount: number
  robotsStatus: CrawlRunRow['robots_status']
  sitemapStatus: CrawlRunRow['sitemap_status']
  /** Reused verbatim from lib/category-engine/site-access.ts — never recomputed by a second model. Kept on the persisted record for diagnostics/traceability. */
  siteAccessState: SiteAccessState
  level: TechnicalSeoCoverageLevel
}

/**
 * `precomputedSiteAccessState` is optional purely so a caller that already
 * computed it (lib/technical-seo/run-analysis.ts — which also needs it to
 * decide which findings to suppress, and wraps the computation in the same
 * per-step isolation try/catch every other analysis step gets) can pass it
 * through instead of this function silently recomputing it a second time
 * from the same pages. Every direct test call omits it and gets the same
 * answer either way — this is a call-site optimization, never a second
 * source of truth.
 */
export function computeTechnicalSeoCoverage(
  pages: CrawlPageRow[],
  crawlRun: Pick<CrawlRunRow, 'robots_status' | 'sitemap_status'>,
  precomputedSiteAccessState?: SiteAccessState
): TechnicalSeoCoverage {
  const completedPageCount = pages.filter((page) => page.status === 'completed').length
  const eligiblePageCount = pages.filter(isSuccessfulHtmlFetch).length
  const siteAccessState = precomputedSiteAccessState ?? computeSiteAccessState(pages)

  const level: TechnicalSeoCoverageLevel =
    siteAccessState === 'blocked' || siteAccessState === 'fetch_failed'
      ? 'none'
      : completedPageCount === 0
        ? 'none'
        : eligiblePageCount === 0
          ? 'low'
          : 'adequate'

  return {
    eligiblePageCount,
    completedPageCount,
    robotsStatus: crawlRun.robots_status,
    sitemapStatus: crawlRun.sitemap_status,
    siteAccessState,
    level,
  }
}
