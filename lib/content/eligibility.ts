import { isEligibleContentPage } from '@/lib/category-engine/eligibility'
import type { CrawlPageRow } from '@/lib/crawler/types'

/**
 * Phase 29 — Content Intelligence's page eligibility. Reuses the shared
 * lib/category-engine/eligibility.ts predicate as the STRUCTURAL gate
 * (2xx HTML, not noindex, self-canonical) — a page failing this is not a
 * candidate for content evaluation at all, identical reasoning to
 * On-Page SEO and Site Architecture.
 *
 * EXTRACTION CONFIDENCE is a SEPARATE, additional dimension specific to
 * Content Intelligence — Phase 28 confirmed webioom analyzes raw
 * server-returned HTML, never a rendered/hydrated DOM. A page that is
 * genuinely thin and a page whose real content this crawler cannot see
 * (client-rendered, or using a markup structure our block extraction
 * missed) can look IDENTICAL in persisted evidence. This is NOT an
 * eligibility exclusion (the page is still analyzed) — it only LOWERS
 * CONFIDENCE on findings that depend on word count.
 *
 * TWO LAYERED SIGNALS, combined here:
 *
 * 1. `content_extraction_confidence` (persisted at CRAWL TIME — see
 *    lib/crawler/content-extract.ts): compares the block-based substantive
 *    word count against the FULL raw visible-text word count for the SAME
 *    page. Catches "real visible text exists, but our block extraction
 *    didn't recognize it as substantive" — exactly the real-world Bespoke
 *    failure mode this signal was added to catch (see
 *    docs/content-intelligence-engine.md's root-cause section).
 * 2. The HTML-bytes-vs-word-count check below (ANALYSIS TIME, unchanged
 *    from the original Phase 29 implementation): catches the DIFFERENT
 *    failure mode where a page's HTML is large (e.g. an inline JS bundle)
 *    but even the raw visible text is minimal — a genuinely client-rendered
 *    page, where signal 1 alone would not fire (its own raw-visible-text
 *    floor is never reached).
 *
 * Either signal alone is sufficient to report 'low' — this is deliberately
 * OR'd, not AND'd, so a page is never confidently called low-content unless
 * BOTH checks independently found nothing suspicious.
 */
export function isContentEligiblePage(page: CrawlPageRow): boolean {
  return isEligibleContentPage(page)
}

/**
 * Thresholds are deliberately conservative and documented, not folklore:
 * 20,000 bytes of HTML is a generously low bar (a near-empty template page
 * is often smaller; a real content page's HTML — including its template
 * chrome — is very rarely under 20KB), and 20 extracted words is a floor
 * far below even the lowest page-type thin-content threshold (see
 * lib/content/checks/thin-content.ts) — this signal is specifically about
 * "HTML bytes vastly outweigh extracted text," not about the text amount
 * itself, which the thinness check already evaluates on its own terms.
 */
const SUSPICIOUS_HTML_BYTES = 20_000
const SUSPICIOUS_WORD_COUNT = 20

export type ExtractionConfidence = 'high' | 'low'

export function getExtractionConfidence(page: CrawlPageRow): ExtractionConfidence {
  if (page.content_extraction_confidence === 'low') return 'low'

  const htmlBytes = page.response_size_bytes ?? 0
  const wordCount = page.content_word_count ?? 0

  if (htmlBytes > SUSPICIOUS_HTML_BYTES && wordCount < SUSPICIOUS_WORD_COUNT) {
    return 'low'
  }

  return 'high'
}
