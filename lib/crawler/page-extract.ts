import {
  getTitleText,
  getMetaDescriptionContent,
  getH1Texts,
  getCanonicalHref,
  hasNoindexMetaRobots,
  hasNoindexXRobotsTag,
  getJsonLdBlocks,
  getHreflangTags,
} from '@/lib/scanner/checks'
import { normalizeUrl } from '@/lib/scanner/url-utils'

/**
 * Phase 25A — the deliberately minimal set of page facts persisted onto
 * crawl_pages (title/meta description/first H1/canonical/noindex). Reuses
 * the scanner's own existing extractors verbatim rather than duplicating
 * any HTML parsing — this is composition, not a second parser. Anything
 * beyond this (every heading, all images, full text) is intentionally out
 * of scope for crawl_pages per this phase's own instruction; a future
 * page_snapshots table is where richer content facts belong.
 *
 * Phase 26B additive extraction (structured data presence/validity,
 * hreflang tags): reuses the SAME already-fetched HTML this function
 * already parses — no new network call, no crawler redesign. JSON-LD
 * validity is checked with the built-in `JSON.parse` (no new dependency);
 * this is syntax validity only, never schema.org semantic/Rich-Results
 * validation — see lib/technical-seo/checks/structured-data.ts's own doc
 * comment for why that distinction matters.
 */
export type ExtractedPageMetadata = {
  title: string | null
  metaDescription: string | null
  h1Text: string | null
  canonicalUrl: string | null
  noindex: boolean
  structuredDataPresent: boolean
  structuredDataValid: boolean | null
  structuredDataError: string | null
  hreflangTags: Array<{ lang: string; href: string }>
}

function extractStructuredData(html: string): Pick<ExtractedPageMetadata, 'structuredDataPresent' | 'structuredDataValid' | 'structuredDataError'> {
  const blocks = getJsonLdBlocks(html)
  if (blocks.length === 0) {
    return { structuredDataPresent: false, structuredDataValid: null, structuredDataError: null }
  }

  for (const block of blocks) {
    try {
      JSON.parse(block)
    } catch (error) {
      return { structuredDataPresent: true, structuredDataValid: false, structuredDataError: error instanceof Error ? error.message.slice(0, 200) : 'Invalid JSON' }
    }
  }

  return { structuredDataPresent: true, structuredDataValid: true, structuredDataError: null }
}

export function extractPageMetadata(html: string, pageUrl: string, xRobotsTag: string | null): ExtractedPageMetadata {
  const h1Texts = getH1Texts(html)
  const rawCanonical = getCanonicalHref(html)
  const canonicalUrl = rawCanonical ? normalizeUrl(rawCanonical, pageUrl) : null
  const structuredData = extractStructuredData(html)

  const hreflangTags = getHreflangTags(html)
    .map((tag) => ({ lang: tag.lang, href: normalizeUrl(tag.href, pageUrl) ?? tag.href }))
    .slice(0, 50) // a defensive cap — no real site needs more alternate-language versions than this on one page

  return {
    title: getTitleText(html),
    metaDescription: getMetaDescriptionContent(html),
    h1Text: h1Texts.length > 0 ? h1Texts[0] : null,
    canonicalUrl,
    noindex: hasNoindexMetaRobots(html) || hasNoindexXRobotsTag(xRobotsTag),
    ...structuredData,
    hreflangTags,
  }
}
