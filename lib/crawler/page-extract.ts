import {
  getTitleText,
  getMetaDescriptionContent,
  getH1Texts,
  getCanonicalHref,
  hasNoindexMetaRobots,
  hasNoindexXRobotsTag,
} from '@/lib/scanner/checks'
import { normalizeUrl } from '@/lib/scanner/url-utils'

/**
 * Phase 25A — the deliberately minimal set of page facts persisted onto
 * crawl_pages (title/meta description/first H1/canonical/noindex). Reuses
 * the scanner's own existing extractors verbatim rather than duplicating
 * any HTML parsing — this is composition, not a second parser. Anything
 * beyond this (every heading, all images, structured data, full text) is
 * intentionally out of scope for crawl_pages per this phase's own
 * instruction; a future page_snapshots table (Phase 26+) is where richer
 * content facts belong.
 */
export type ExtractedPageMetadata = {
  title: string | null
  metaDescription: string | null
  h1Text: string | null
  canonicalUrl: string | null
  noindex: boolean
}

export function extractPageMetadata(html: string, pageUrl: string, xRobotsTag: string | null): ExtractedPageMetadata {
  const h1Texts = getH1Texts(html)
  const rawCanonical = getCanonicalHref(html)
  const canonicalUrl = rawCanonical ? normalizeUrl(rawCanonical, pageUrl) : null

  return {
    title: getTitleText(html),
    metaDescription: getMetaDescriptionContent(html),
    h1Text: h1Texts.length > 0 ? h1Texts[0] : null,
    canonicalUrl,
    noindex: hasNoindexMetaRobots(html) || hasNoindexXRobotsTag(xRobotsTag),
  }
}
