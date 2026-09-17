import type { CrawlPageRow } from '@/lib/crawler/types'
import { normalizeUrl } from '@/lib/scanner/url-utils'

/**
 * Phase 27, real-world evidence-quality pass — the general, evidence-based
 * ARCHITECTURE-ELIGIBLE PAGE concept requested after the Bespoke
 * calibration review found two `?wpr_mega_menu=...` WordPress mega-menu
 * endpoints surfacing as "dead end" candidates.
 *
 * TRACE (discovery -> persistence -> graph -> eligibility -> finding):
 * `lib/crawler/url-policy.ts`'s `normalizeCrawlUrl` deliberately keeps every
 * query parameter not on its small tracking-parameter denylist (documented
 * there: "a query string can legitimately select different content... never
 * stripped by default"), so a mega-menu widget's own `<a href>` becomes a
 * distinct, genuinely-crawled `crawl_pages` row — this is correct, general,
 * CMS-agnostic crawler behavior, not a bug. `lib/scanner/url-utils.ts`'s
 * `isCrawlablePageUrl` only excludes known asset extensions (images, CSS,
 * JS, documents, etc.), so a query-only URL passes discovery fine. The
 * defect is NOT in discovery — it is that every architecture page-level
 * check (orphan/underlinked/dead-end/deep-page) treated every discovered,
 * successfully-fetched HTML page as an equally legitimate destination in the
 * site's navigable information architecture, with no concept that some
 * fetched resources are utility/template endpoints rather than content
 * pages.
 *
 * THE GENERAL RULE (deliberately NOT a CMS-specific URL-pattern hack — no
 * check here ever inspects a URL's path or query string): a page counts as
 * an architecture-eligible destination only if the page's OWN evidence
 * affirmatively supports it being one:
 *
 *   1. It was actually fetched successfully as an HTML document in the
 *      2xx range. A failed fetch, a non-2xx status, or a non-HTML response
 *      is not a content page this check should reason about at all — its
 *      own defect (if any) is already the exact subject of the broken-edge/
 *      redirect-edge checks, which remain edge-based and unaffected by this
 *      predicate (see each check-specific doc comment for why).
 *   2. It does not declare noindex. A page the site owner has explicitly
 *      excluded from search indexing has explicitly said "this is not a
 *      primary discoverable destination" — a general, standards-based
 *      signal already persisted by Phase 25, not a guess.
 *   3. It self-canonicalizes (no canonical tag, or a canonical tag pointing
 *      back at its own URL) — a page whose OWN <link rel="canonical">
 *      names a DIFFERENT URL as authoritative has explicitly declared
 *      itself a duplicate/variant of that other page, not an independent
 *      destination in the architecture.
 *
 * This is a conservative, keep-by-default rule per this task's own explicit
 * instruction: "If webioom cannot confidently exclude a resource, prefer
 * keeping it... rather than silently deleting legitimate pages." A page
 * only fails eligibility when its OWN persisted evidence affirmatively says
 * so (noindex=true, or a canonical explicitly naming another URL) — an
 * ordinary page that merely happens to carry a query string, with no
 * noindex and no cross-canonical, remains fully eligible. Whether the two
 * actual Bespoke `?wpr_mega_menu=...` URLs specifically declared noindex or
 * a cross-canonical cannot be confirmed from this repository alone (no live
 * Supabase access in this environment) — the general rule is verified here
 * against every existing fixture and the invariants Phase 25 documents, not
 * against Bespoke's own unseen persisted rows. See
 * docs/site-architecture-engine.md's "Page eligibility" section for the
 * check-by-check application of this predicate and for what a live
 * inspection of Bespoke's crawl_pages rows would need to confirm.
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
 * "cannot confidently exclude" (returns true) rather than as a disqualifier
 * — consistent with this module's conservative, keep-by-default policy.
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
 * A page that meaningfully participates in the site's navigable
 * information architecture, as opposed to a crawled resource/utility
 * endpoint. Used to gate which pages are eligible SUBJECTS for the
 * page-level checks (orphan, underlinked, dead-end, deep-page,
 * widespread-isolated) — never used to filter the link GRAPH itself, so a
 * real link from or to an ineligible page still counts toward every other
 * page's own inbound/outbound counts exactly as observed.
 */
export function isArchitectureEligiblePage(page: CrawlPageRow): boolean {
  if (!isSuccessfulHtmlFetch(page)) return false
  if (page.noindex === true) return false
  if (!selfCanonicalizes(page)) return false
  return true
}
