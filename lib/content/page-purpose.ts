import type { CrawlPageRow } from '@/lib/crawler/types'
import type { Confidence } from './types'

/**
 * Phase 29 — a deliberately CONSERVATIVE page-purpose classifier, expanded
 * (Phase 29 targeted completion pass) beyond homepage/contact/unknown to
 * also recognize service/product/article/about/category pages — still
 * governed by the same core principle: a WRONG classification is worse than
 * no classification, so `unknown` remains the default whenever evidence is
 * ambiguous.
 *
 * TWO DIFFERENT RELIABILITY TIERS, both deliberately conservative but for
 * different reasons:
 *
 * 1. 'homepage': the crawl's own seed/depth-0 page — a structural fact, not
 *    a guess. 'high' confidence.
 * 2. 'contact'/'about': require TWO INDEPENDENT signals to agree (an exact
 *    URL PATH SEGMENT match — never a substring match anywhere in the URL —
 *    AND at least one of title/H1 independently corroborating) before
 *    classifying. These two concepts are standardized page IDEAS across
 *    virtually every business website, but the same WORD can plausibly
 *    appear elsewhere for an unrelated reason (a services page whose body
 *    text happens to say "contact us" isn't a contact page), so URL alone
 *    is never trusted.
 * 3. 'service'/'product'/'article'/'category': classified from an EXACT URL
 *    PATH SEGMENT match ALONE, with no title/H1 corroboration required.
 *    This is deliberately different from the contact/about tier: these are
 *    not content words that could show up incidentally — they are
 *    ROUTING/INFORMATION-ARCHITECTURE conventions a site deliberately
 *    chooses (a URL path segment is a structural decision, not incidental
 *    prose), and each is checked as a WHOLE path segment (delimited by "/"),
 *    never a substring, so "/services-agreement" never matches "services".
 *    Confidence is 'medium', never 'high' — a URL convention is still an
 *    inference, not as certain as the homepage's structural depth===0 fact.
 *
 * A bare listing root (e.g. "/services", "/shop", "/blog" with NO further
 * path segment after it) is classified as 'category' (a listing/index page)
 * rather than the specific type — an individual item lives at a DEEPER path
 * ("/services/digital-marketing", "/shop/widget", "/blog/my-post"). This
 * mirrors a standard, generic site-architecture convention (index vs. detail
 * pages), not a guess: "category"/"categories"/"collections" segments are
 * always treated as listings regardless of depth, since a subcategory page
 * is still a listing of items, never a single item itself.
 *
 * 'landing' and 'other' are DEFINED types (per this phase's own requested
 * taxonomy) with NO active classification rule in this pass — there is no
 * reliable generic structural signal available (no campaign/UTM evidence,
 * no link-fan-in graph wired into this classifier yet) to distinguish a
 * landing page from an ordinary page without fabricating certainty. Every
 * page that doesn't match a rule above returns 'unknown', exactly as before.
 */
export type PageType = 'homepage' | 'contact' | 'about' | 'service' | 'product' | 'article' | 'category' | 'landing' | 'other' | 'unknown'

export type PageTypeResult = { type: PageType; confidence: Confidence }

const CONTACT_SIGNAL = /\bcontact\b/i
const ABOUT_SIGNAL = /\babout\b/i

/** Exact path-segment matchers (never substring-anywhere) for the URL-alone tier. */
const CATEGORY_ROOT_SEGMENTS = new Set(['category', 'categories', 'collection', 'collections'])
const SERVICE_ROOT_SEGMENTS = new Set(['service', 'services'])
const PRODUCT_ROOT_SEGMENTS = new Set(['product', 'products', 'shop', 'store'])
const ARTICLE_ROOT_SEGMENTS = new Set(['blog', 'news', 'article', 'articles', 'insight', 'insights', 'resource', 'resources'])
const ABOUT_ROOT_SEGMENTS = new Set(['about', 'about-us', 'about_us', 'aboutus'])
const CONTACT_ROOT_SEGMENT = /\bcontact\b/i

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname
      .toLowerCase()
      .split('/')
      .filter((segment) => segment.length > 0)
  } catch {
    return []
  }
}

function urlSuggestsContact(url: string): boolean {
  const segments = pathSegments(url)
  return segments.some((segment) => CONTACT_ROOT_SEGMENT.test(segment))
}

export function classifyPageType(page: CrawlPageRow, isHomepage: boolean): PageTypeResult {
  if (isHomepage) {
    return { type: 'homepage', confidence: 'high' }
  }

  const url = page.final_url ?? page.url
  const segments = pathSegments(url)

  // Tier 2: contact/about — URL path segment AND at least one of title/H1
  // must independently agree. Never URL alone.
  const contactUrlSignal = urlSuggestsContact(url)
  const contactTitleSignal = !!page.title && CONTACT_SIGNAL.test(page.title)
  const contactH1Signal = !!page.h1_text && CONTACT_SIGNAL.test(page.h1_text)
  if (contactUrlSignal && (contactTitleSignal || contactH1Signal)) {
    return { type: 'contact', confidence: 'medium' }
  }

  const aboutUrlSignal = segments.some((segment) => ABOUT_ROOT_SEGMENTS.has(segment))
  const aboutTitleSignal = !!page.title && ABOUT_SIGNAL.test(page.title)
  const aboutH1Signal = !!page.h1_text && ABOUT_SIGNAL.test(page.h1_text)
  if (aboutUrlSignal && (aboutTitleSignal || aboutH1Signal)) {
    return { type: 'about', confidence: 'medium' }
  }

  // Tier 3: service/product/article/category — exact URL path segment
  // alone (a routing convention, not incidental prose). A bare root segment
  // with nothing deeper is a listing ('category'); category/collection
  // roots are ALWAYS a listing regardless of depth.
  if (segments.some((segment) => CATEGORY_ROOT_SEGMENTS.has(segment))) {
    return { type: 'category', confidence: 'medium' }
  }

  const lastSegmentIndex = segments.length - 1
  for (const [rootSegments, type] of [
    [SERVICE_ROOT_SEGMENTS, 'service'],
    [PRODUCT_ROOT_SEGMENTS, 'product'],
    [ARTICLE_ROOT_SEGMENTS, 'article'],
  ] as const) {
    const rootIndex = segments.findIndex((segment) => rootSegments.has(segment))
    if (rootIndex === -1) continue
    // A bare root with nothing after it is a listing page, not an individual item.
    return rootIndex === lastSegmentIndex ? { type: 'category', confidence: 'medium' } : { type, confidence: 'medium' }
  }

  return { type: 'unknown', confidence: 'low' }
}
