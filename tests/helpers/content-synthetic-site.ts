import { makeCrawlRun, makePage } from './architecture-fixtures'
import type { CrawlPageRow, CrawlRunRow } from '@/lib/crawler/types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 29 — controlled synthetic Content Intelligence fixtures for
 * calibration/mutation testing, mirroring tests/helpers/
 * on-page-synthetic-site.ts's own disjoint-offset-mutator pattern exactly
 * (itself learned directly from Phase 27's documented fixture-overlap bug):
 * every mutator takes explicit index ranges so composing several mutations
 * on one synthetic site cannot silently overlap and cancel out.
 *
 * Every healthy baseline page ALREADY includes one shared "CTA" paragraph
 * (present on every page, exactly like a real site's repeated
 * call-to-action) alongside 2-3 genuinely unique paragraphs — this means
 * the shared paragraph is ALWAYS well above the boilerplate frequency
 * threshold regardless of which mutations are applied, and healthy pages
 * legitimately have a LOW boilerplate ratio (their own unique paragraphs
 * dominate) while a page mutated to be "highly repetitive" has almost
 * nothing BUT that shared paragraph.
 */
const SHARED_CTA_PARAGRAPH = 'Contact us today to schedule a free consultation with our experienced team of specialists.'

export function buildHealthyPages(count: number): CrawlPageRow[] {
  return Array.from({ length: count }, (_, i) => {
    const unique1 = `This page covers topic number ${i} in detail, explaining exactly what visitors need to know about it.`
    const unique2 = `Our approach to topic ${i} includes a clear process, real examples, and a straightforward next step for visitors.`
    return makePage({
      url: `https://example.com/page-${i}`,
      title: `Distinct Page ${i}`,
      h1_text: `Topic ${i} Overview`,
      content_text: [SHARED_CTA_PARAGRAPH, unique1, unique2].join('\n\n'),
      content_word_count: 200,
      content_paragraph_count: 3,
      content_heading_texts: ['Frequently Asked Questions'],
      content_hash: `unique-hash-${i}`,
    })
  })
}

function slice(pages: CrawlPageRow[], count: number, offset: number): CrawlPageRow[] {
  return pages.slice(offset, offset + count)
}

export function makeThin(pages: CrawlPageRow[], count: number, offset = 0): void {
  for (const page of slice(pages, count, offset)) {
    page.content_word_count = 20
  }
}

export function makeExactDuplicates(pages: CrawlPageRow[], count: number, offset = 0, sharedHash = 'shared-duplicate-hash'): void {
  const sharedText = [
    'This is identical duplicated content appearing on multiple different pages of the site without any changes.',
    'The exact same paragraph text repeats here as well, word for word, across every one of these affected pages.',
  ].join('\n\n')

  for (const page of slice(pages, count, offset)) {
    page.content_hash = sharedHash
    page.content_text = sharedText
    page.content_word_count = 200
  }
}

export function makeHighlyRepetitive(pages: CrawlPageRow[], count: number, offset = 0): void {
  for (const page of slice(pages, count, offset)) {
    page.content_text = [SHARED_CTA_PARAGRAPH, SHARED_CTA_PARAGRAPH, SHARED_CTA_PARAGRAPH].join('\n\n')
    page.content_paragraph_count = 3
    page.content_word_count = 200
  }
}

export function makeWeakStructure(pages: CrawlPageRow[], count: number, offset = 0): void {
  for (const page of slice(pages, count, offset)) {
    page.content_paragraph_count = 1
    page.content_heading_texts = []
    page.content_word_count = 200
  }
}

export function toEvidence(pages: CrawlPageRow[], crawlRunOverrides: Partial<CrawlRunRow> = {}): CrawlEvidence {
  return { crawlRun: makeCrawlRun({ status: 'completed', ...crawlRunOverrides }), pages, links: [] }
}
