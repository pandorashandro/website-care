import type { CrawlPageRow } from '@/lib/crawler/types'
import { isEligibleContentPage, eligibilityFailureReason, type EligibilityFailureReason } from './eligibility'

/**
 * Evidence-aware health scoring (2026-09-22). Every canonical engine (On-Page,
 * Technical SEO, Architecture, Content, Pillars) already knows whether ITS
 * OWN checks had enough evidence via its own `coverage` record — this is a
 * DIFFERENT, coarser question asked once, at the whole-crawl level, for
 * Overview: "did webioom actually get INTO this website at all?" A visitor
 * looking at Overview after a blocked crawl should not have to notice that
 * all seven pillar cards independently say "Not assessed" and infer the
 * cause themselves — this is the single, prominent, root-cause signal.
 *
 * A "successfully received HTTP response" (crawl_pages.status === 'completed')
 * is NOT the same fact as "successfully analyzed website content" — a 403
 * from a firewall/WAF challenge page is a real, complete HTTP response, but
 * tells webioom nothing about the actual website. This function is built
 * entirely from evidence every crawl already records (http_status,
 * eligibility), never a body-pattern/challenge-page heuristic (no such
 * signal exists anywhere in this schema — see this file's own test suite
 * for the documented, generic classification instead).
 */
export type SiteAccessState = 'accessible' | 'partially_accessible' | 'blocked' | 'fetch_failed' | 'insufficient_content'

const BLOCKED_OR_ERROR_STATUSES = new Set([401, 403, 429]) // 5xx handled by a range check below, not this set

function isBlockedOrErrorStatus(httpStatus: number | null): boolean {
  return typeof httpStatus === 'number' && (BLOCKED_OR_ERROR_STATUSES.has(httpStatus) || httpStatus >= 500)
}

/**
 * `'fetch_failed'` — nothing came back at all (every single crawl_pages row
 * failed at the transport level; e.g. DNS/TLS/connection failure).
 * `'blocked'` — pages responded, but with a status that suggests a firewall/
 * bot-protection/server-error response rather than real content, and zero
 * pages were actually eligible.
 * `'insufficient_content'` — pages responded normally (2xx-ish) but were
 * still excluded for other reasons (all noindex, all cross-canonical, all
 * non-HTML) — a real, if less common, "nothing to analyze" shape distinct
 * from a block.
 * `'partially_accessible'` — at least one eligible page exists, but at
 * least one other page returned a blocked/error status — real evidence
 * exists, but not the full picture.
 * `'accessible'` — the normal case.
 */
export function computeSiteAccessState(pages: CrawlPageRow[]): SiteAccessState {
  const completed = pages.filter((page) => page.status === 'completed')
  if (completed.length === 0) return 'fetch_failed'

  const blockedOrErrorPages = completed.filter((page) => isBlockedOrErrorStatus(page.http_status))
  const eligible = pages.filter(isEligibleContentPage)

  if (eligible.length === 0) {
    return blockedOrErrorPages.length > 0 ? 'blocked' : 'insufficient_content'
  }

  return blockedOrErrorPages.length > 0 ? 'partially_accessible' : 'accessible'
}

const INELIGIBILITY_REASON_LABEL: Record<EligibilityFailureReason, string> = {
  blocked_or_error_status: 'returned an error or non-success response when webioom tried to fetch it (this often means a firewall or bot-protection block)',
  non_html: "didn't return an HTML page webioom could read",
  noindex: 'was explicitly marked "noindex" by the page itself',
  cross_canonical: 'declared a different page as its canonical version',
  not_fetched: 'could not be reached during the crawl',
}

/**
 * Classifies every crawled page EXCLUDED from analysis using
 * `eligibilityFailureReason` (the SAME logic that decided the page was
 * ineligible in the first place), and returns a plain-language description
 * of the most common reason. Shared canonical home for this reasoning —
 * lib/on-page/coverage.ts re-exports this exact function rather than
 * keeping its own copy.
 */
export function describeMostCommonIneligibilityReason(pages: CrawlPageRow[]): string | null {
  const counts: Record<EligibilityFailureReason, number> = { blocked_or_error_status: 0, non_html: 0, noindex: 0, cross_canonical: 0, not_fetched: 0 }

  for (const page of pages) {
    const reason = eligibilityFailureReason(page)
    if (reason) counts[reason]++
  }

  const ranked = (Object.entries(counts) as [EligibilityFailureReason, number][]).sort((a, b) => b[1] - a[1])
  const [topReason, topCount] = ranked[0]
  if (topCount === 0) return null
  return INELIGIBILITY_REASON_LABEL[topReason]
}
