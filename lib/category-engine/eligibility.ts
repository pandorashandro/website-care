import type { CrawlPageRow } from '@/lib/crawler/types'
import { normalizeUrl } from '@/lib/scanner/url-utils'

/**
 * Phase 28 — the general "is this page a real, indexable content page or a
 * crawled utility/template resource" concept, extracted here once a SECOND
 * category engine (lib/on-page/) needed the exact same rule
 * lib/architecture/eligibility.ts already implements (added in the Phase 27
 * real-world evidence-quality pass, triggered by WordPress mega-menu
 * query-string endpoints surfacing as false-positive "dead end" findings).
 *
 * Deliberately NOT wired as a re-export from lib/architecture/eligibility.ts
 * — that module is part of an already-accepted, fully-tested category
 * engine, and Phase 28's own instructions explicitly forbid changing Site
 * Architecture's behavior. This is a fresh, independent copy of the same
 * logic, intended as the canonical home for every FUTURE category engine
 * that needs it; lib/architecture/eligibility.ts is left untouched as
 * documented, low-priority tech debt (mirrors lib/architecture/aggregate.ts's
 * own accepted "genuine candidate for extraction, not yet extracted"
 * precedent) rather than risking a behavior change to accepted code for a
 * pure refactor.
 *
 * THE RULE (general, evidence-based, never URL-pattern/CMS-specific): a page
 * counts as an eligible content page only if its OWN persisted evidence
 * affirmatively supports it —
 *
 *   1. Fetched successfully as an HTML document in the 2xx range. A failed
 *      fetch, non-2xx status, or non-HTML response is not a content page a
 *      category engine should reason about as one.
 *   2. Does not declare noindex — an explicit, standards-based "this is not
 *      a primary discoverable destination" signal from the site owner.
 *   3. Self-canonicalizes (no canonical tag, or one pointing back at its own
 *      URL) — a page whose own canonical tag names a DIFFERENT URL as
 *      authoritative has declared itself a duplicate/variant, not an
 *      independent page.
 *
 * Conservative and keep-by-default: a page fails eligibility only when its
 * OWN evidence affirmatively says so (noindex=true, or a canonical naming
 * another URL) — an ordinary page that merely carries a query string, with
 * no noindex and no cross-canonical, remains fully eligible. Never infers
 * unavailable facts, never excludes on URL shape alone.
 */
function isHtmlLikeContentType(page: Pick<CrawlPageRow, 'content_type'>): boolean {
  return !page.content_type || page.content_type.toLowerCase().includes('html')
}

/**
 * Exported (Sprint: evidence-aware health scoring, 2026-09-22) for reuse by
 * checks that need "was this page genuinely fetched as real content" WITHOUT
 * the noindex/self-canonical narrowing `isEligibleContentPage` also applies
 * — most importantly Technical SEO's own indexability/structured-data/
 * hreflang checks, whose entire job is to examine a page's noindex/canonical
 * signals and therefore cannot use a predicate that already excludes pages
 * on those exact signals. Filtering on this (2xx HTML) instead of on
 * `page.status === 'completed'` alone is what prevents a blocked/challenge
 * response (still `status: 'completed'`, but e.g. HTTP 403) from having ITS
 * noindex tag or structured data mistaken for the real page's own.
 */
export function isSuccessfulHtmlFetch(page: CrawlPageRow): boolean {
  return page.status === 'completed' && isHtmlLikeContentType(page) && typeof page.http_status === 'number' && page.http_status >= 200 && page.http_status < 300
}

/**
 * True unless the page's own canonical tag names a DIFFERENT URL as
 * authoritative. Unparseable/unresolvable canonical evidence is treated as
 * "cannot confidently exclude" (returns true) — conservative, keep-by-default.
 */
function selfCanonicalizes(page: CrawlPageRow): boolean {
  if (!page.canonical_url) return true

  const ownUrl = page.final_url ?? page.url
  const resolvedCanonical = normalizeUrl(page.canonical_url, ownUrl)
  const resolvedOwn = normalizeUrl(ownUrl, ownUrl)
  if (!resolvedCanonical || !resolvedOwn) return true

  return resolvedCanonical === resolvedOwn
}

/**
 * A page that meaningfully participates as a real, indexable content page —
 * as opposed to a crawled resource/utility endpoint. Shared across every
 * category engine that needs this exact distinction; never filters the
 * crawl's underlying evidence itself (link graphs, other pages' own
 * inbound/outbound counts), only which pages are eligible SUBJECTS for a
 * given check.
 */
export function isEligibleContentPage(page: CrawlPageRow): boolean {
  if (!isSuccessfulHtmlFetch(page)) return false
  if (page.noindex === true) return false
  if (!selfCanonicalizes(page)) return false
  return true
}

export type EligibilityFailureReason = 'not_fetched' | 'blocked_or_error_status' | 'non_html' | 'noindex' | 'cross_canonical'

/**
 * Founder-reported bug (2026-09-22): the on-page-seo report page needs to
 * explain WHY a page didn't count toward analysis (blocked/403, noindex,
 * etc.) instead of leaving a low eligible-page count unexplained. This
 * shares the exact same checks isEligibleContentPage uses, in the same
 * order, so the reason returned can never disagree with the eligibility
 * verdict — a hand-rolled second copy of these checks would risk drifting
 * out of sync (e.g. mis-flagging a SELF-referential canonical tag as
 * "cross_canonical"). Returns null when the page IS eligible.
 */
export function eligibilityFailureReason(page: CrawlPageRow): EligibilityFailureReason | null {
  if (page.status !== 'completed') return 'not_fetched'
  if (!isHtmlLikeContentType(page)) return 'non_html'
  if (typeof page.http_status !== 'number' || page.http_status < 200 || page.http_status >= 300) return 'blocked_or_error_status'
  if (page.noindex === true) return 'noindex'
  if (!selfCanonicalizes(page)) return 'cross_canonical'
  return null
}

/**
 * Prompt 3 (PAYABLE V1 convergence) — real-world false-positive protection.
 *
 * A real crawl once surfaced page-builder template-preview URLs (carrying a
 * query string, reached only by following an internal link — never listed
 * in the site's own sitemap, never the seed URL) inside a duplicate-content
 * group alongside the actual homepage. Those pages pass every existing
 * eligibility check (2xx HTML, not noindex, self-canonical), so they are
 * correctly still ANALYZED — the fix is not to exclude them (that risks
 * hiding a real problem on a legitimate query-string page) but to flag when
 * a finding's evidence leans heavily on pages exhibiting this pattern, so
 * that finding can report reduced confidence instead of asserting the same
 * certainty as a finding built entirely from primary, deliberately-listed
 * pages.
 *
 * DELIBERATELY GENERIC AND EVIDENCE-BASED — no CMS/platform/plugin name, no
 * specific query-string key, no specific customer URL is ever referenced.
 * The two signals combined here are both already generic evidence recorded
 * for every crawled page, for every website, regardless of platform:
 *
 *   1. `discovered_via === 'link'` — this page was found only by following
 *      another page's own link, never declared by the site owner as a
 *      primary destination (a 'sitemap' entry) nor the crawl's own starting
 *      point (a 'seed' page).
 *   2. The URL carries a query string — a strong general indicator of a
 *      parameterized, dynamically-generated variant rather than a
 *      deliberately-authored destination page.
 *
 * Both together, not either alone: `discovered_via === 'link'` alone would
 * flag the majority of ordinary content on any site with no sitemap (far
 * too broad to be defensible), and a query string alone would flag
 * legitimate paginated/filtered content the site owner explicitly listed.
 * The conjunction is a narrow, conservative signal — never used to exclude
 * a page from analysis, only to let a finding built substantially from such
 * pages report its confidence honestly instead of overstating it. This is
 * intentionally the full extent of this signal — a single, bounded,
 * documented rule, not the start of an open-ended calibration effort.
 */
export function hasLikelyAuxiliaryUrlSignal(page: CrawlPageRow): boolean {
  if (page.discovered_via !== 'link') return false
  const url = page.final_url ?? page.url
  return url.includes('?')
}
