import { createHash } from 'node:crypto'
import { getSubstantiveBlocks, getH2Texts, getVisibleText } from '@/lib/scanner/checks'

/**
 * Phase 29 — the SMALLEST responsible crawler evidence expansion Content
 * Intelligence needs, deliberately compact rather than persisting raw HTML.
 * Reuses the SAME already-fetched HTML every other extractor
 * (lib/crawler/page-extract.ts) already parses — no new network call, no
 * second fetch, no headless browser.
 *
 * WHY THESE FIELDS AND NOT RAW HTML: storing full page HTML per crawl would
 * grow crawl_pages by an order of magnitude (a real page's HTML commonly
 * runs 50-300KB; 500 pages x 200KB ~= 100MB PER CRAWL RUN, repeated on every
 * re-analysis/re-crawl) for data almost none of which (styling, scripts,
 * markup structure) Content Intelligence actually reasons about. Compact
 * structured evidence — a bounded text sample, counts, headings, a
 * fingerprint, and an extraction-confidence flag — is enough for every
 * Phase 29 check and remains reusable for a future AI interpretation pass.
 *
 * PRIVACY: only publicly-fetched, already-rendered page body text is ever
 * captured here (the same trust boundary as title/meta_description/h1_text,
 * already persisted since Phase 25A) — never form fields, cookies, headers,
 * or anything not already visible to any anonymous visitor of the page.
 *
 * TRUNCATION: `content_text` is bounded to CONTENT_TEXT_MAX_CHARS — a
 * PREFIX of the page's full substantive text, blocks joined by "\n\n" so a
 * later analysis step can still re-split it into block units.
 * `content_word_count`/`content_paragraph_count` are computed from the FULL
 * (untruncated) text specifically so thin-content detection is never
 * skewed by the storage truncation — only the stored SAMPLE is bounded,
 * not the counts. `content_hash` fingerprints the FULL normalized text for
 * the same reason: exact-duplicate detection must not be blind to two pages
 * that differ only after the truncation point.
 *
 * REAL-WORLD EVIDENCE-QUALITY PASS (root-cause correction — see
 * docs/content-intelligence-engine.md's own root-cause section): extraction
 * is now based on lib/scanner/checks.ts's getSubstantiveBlocks (block-level
 * containers: p/div/li/section/article/etc., with <script>/<style>/<nav>/
 * <header>/<footer> excluded entirely) rather than `<p>`-only extraction,
 * which a real Bespoke crawl proved too narrow — its body copy was not
 * wrapped in literal `<p>` tags, producing a false "0 substantive words"
 * result for visibly populated pages. `MIN_BLOCK_WORDS` filters out short
 * leftover fragments (e.g. an unwrapped menu label) from counting as a
 * genuine content block.
 */
export const CONTENT_TEXT_MAX_CHARS = 4000
export const CONTENT_MAX_HEADINGS = 20
export const CONTENT_HEADING_MAX_CHARS = 150

/** Minimum word count for a page's content to be considered meaningful enough to fingerprint/compare at all — see lib/content/checks/exact-duplicate.ts's own doc comment for why near-empty pages are excluded from duplicate grouping (they are already covered by substantively_thin_page, and hashing near-nothing produces meaningless "matches"). */
export const MIN_WORDS_FOR_FINGERPRINT = 10

/** A block-level fragment must have at least this many words to count as a genuine content block — filters short leftover fragments (e.g. a 2-word menu label not wrapped in <nav>/<header>/<footer>) without needing link-density analysis. See getSubstantiveBlocks' own doc comment for the documented trade-off this implies. */
export const MIN_BLOCK_WORDS = 4

/**
 * EXTRACTION CONFIDENCE, computed once at crawl time (see
 * lib/content/eligibility.ts for how this combines with a second,
 * analysis-time signal). Compares the block-based SUBSTANTIVE word count
 * against the raw VISIBLE text word count (lib/scanner/checks.ts's
 * getVisibleText — literally every visible character, chrome included,
 * never excluded). If a page's raw visible text is clearly non-trivial but
 * almost none of it landed in a substantive block, that is direct evidence
 * this page's real content uses a structure our block extraction is not
 * capturing (e.g. deeply nested custom markup, or content rendered as
 * plain inline text with no wrapping block element at all) — NOT evidence
 * the page is actually empty. This must never be silently read as "0
 * substantive words proves no content" (this phase's own explicit
 * instruction) — it is surfaced as 'low' confidence instead, which
 * lib/content/checks/thin-content.ts uses to soften its own conclusion
 * rather than asserting a confident thin-content verdict.
 */
const RAW_TEXT_MEANINGFUL_THRESHOLD = 40
const LOW_SUBSTANTIVE_THRESHOLD = 20
const SUBSTANTIVE_TO_RAW_GAP_RATIO = 0.3

export type ExtractionConfidence = 'high' | 'low'

export type ExtractedContentEvidence = {
  contentText: string | null
  contentWordCount: number
  contentParagraphCount: number
  contentHeadingTexts: string[]
  contentHash: string | null
  contentExtractionConfidence: ExtractionConfidence
}

function countWords(text: string): number {
  if (!text) return 0
  const matches = text.match(/\S+/g)
  return matches ? matches.length : 0
}

function normalizeForFingerprint(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Extracts Content Intelligence's compact page-content evidence from
 * already-fetched HTML.
 */
export function extractContentEvidence(html: string): ExtractedContentEvidence {
  const blocks = getSubstantiveBlocks(html).filter((block) => countWords(block) >= MIN_BLOCK_WORDS)
  const fullText = blocks.join('\n\n')
  const wordCount = countWords(fullText)

  const headingTexts = getH2Texts(html)
    .filter((text) => text.length > 0)
    .slice(0, CONTENT_MAX_HEADINGS)
    .map((text) => text.slice(0, CONTENT_HEADING_MAX_CHARS))

  const contentHash = wordCount >= MIN_WORDS_FOR_FINGERPRINT ? createHash('sha256').update(normalizeForFingerprint(fullText)).digest('hex') : null

  const rawVisibleWordCount = countWords(getVisibleText(html))
  const extractionGapIsSuspicious =
    rawVisibleWordCount >= RAW_TEXT_MEANINGFUL_THRESHOLD && wordCount < LOW_SUBSTANTIVE_THRESHOLD && wordCount / rawVisibleWordCount < SUBSTANTIVE_TO_RAW_GAP_RATIO

  return {
    contentText: fullText.length > 0 ? fullText.slice(0, CONTENT_TEXT_MAX_CHARS) : null,
    contentWordCount: wordCount,
    contentParagraphCount: blocks.length,
    contentHeadingTexts: headingTexts,
    contentHash,
    contentExtractionConfidence: extractionGapIsSuspicious ? 'low' : 'high',
  }
}
