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

function isSuccessfulHtmlFetch(page: CrawlPageRow): boolean {
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
