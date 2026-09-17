import { isEligibleContentPage } from '@/lib/category-engine/eligibility'

/**
 * Phase 28 — On-Page SEO's page eligibility, reusing the shared
 * lib/category-engine/eligibility.ts predicate verbatim (see that module's
 * own doc comment for the full rule and its false-positive/negative
 * trade-offs). On-Page SEO needs exactly the same distinction Site
 * Architecture already established: title/meta-description/heading
 * findings should describe real, indexable content pages, not crawled
 * utility/template resources (e.g. a WordPress mega-menu query-string
 * endpoint whose "title" is meaningless to evaluate).
 *
 * Applied uniformly to every On-Page V1 check's SUBJECT page — there is no
 * check-specific eligibility split here the way Site Architecture needed
 * (redirect/broken EDGE checks vs. page-level checks): every On-Page check
 * is inherently about a page's own title/meta description/heading, so there
 * is no edge/relationship concept for which target eligibility would be
 * irrelevant.
 */
export function isOnPageEligiblePage(page: Parameters<typeof isEligibleContentPage>[0]): boolean {
  return isEligibleContentPage(page)
}
