import { makeCrawlRun, makePage } from './architecture-fixtures'
import type { CrawlPageRow, CrawlRunRow } from '@/lib/crawler/types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 28 — controlled synthetic On-Page SEO fixtures for calibration/
 * mutation testing, mirroring tests/helpers/architecture-synthetic-site.ts's
 * own hard-learned lesson exactly: every mutator takes explicit index
 * ranges (never "first N pages" defaults) so composing several mutations on
 * one synthetic site cannot silently overlap and cancel each other out —
 * see that file's own doc comment for the full story of the bug this
 * pattern was designed to prevent.
 *
 * `buildHealthyPages` produces pages that are ALREADY maximally distinct
 * from one another (title/meta description/H1 all index-derived, so no two
 * healthy pages ever accidentally collide and register as a duplicate) —
 * every mutator below then deliberately narrows a specific index range away
 * from that healthy baseline.
 */
export function buildHealthyPages(count: number): CrawlPageRow[] {
  return Array.from({ length: count }, (_, i) =>
    makePage({
      url: `https://example.com/page-${i}`,
      title: `Distinct And Descriptive Page Title Number ${i} Here`,
      meta_description: `A page-specific summary describing exactly what page number ${i} on this site covers, in enough detail to be useful.`,
      h1_text: `Descriptive Heading For Page ${i}`,
      h1_count: 1,
    })
  )
}

function slice(pages: CrawlPageRow[], count: number, offset: number): CrawlPageRow[] {
  return pages.slice(offset, offset + count)
}

export function makeMissingTitles(pages: CrawlPageRow[], count: number, offset = 0): void {
  for (const page of slice(pages, count, offset)) page.title = null
}

/** Each mutated title is uniquely suffixed by its own index so this mutator never accidentally ALSO creates a duplicate_title group as a side effect. */
export function makeTitlesTooShort(pages: CrawlPageRow[], count: number, offset = 0): void {
  slice(pages, count, offset).forEach((page, i) => {
    page.title = `Short ${offset + i}`
  })
}

/** Each mutated title is uniquely suffixed by its own index — see makeTitlesTooShort's own comment. */
export function makeTitlesTooLong(pages: CrawlPageRow[], count: number, offset = 0): void {
  slice(pages, count, offset).forEach((page, i) => {
    page.title = `${'A'.repeat(75)} ${offset + i}`
  })
}

export function makeDuplicateTitles(pages: CrawlPageRow[], count: number, offset = 0, sharedTitle = 'Our Shared Duplicate Title Value'): void {
  for (const page of slice(pages, count, offset)) page.title = sharedTitle
}

export function makeMissingMetaDescriptions(pages: CrawlPageRow[], count: number, offset = 0): void {
  for (const page of slice(pages, count, offset)) page.meta_description = null
}

export function makeDuplicateMetaDescriptions(pages: CrawlPageRow[], count: number, offset = 0, shared = 'A'.repeat(100)): void {
  for (const page of slice(pages, count, offset)) page.meta_description = shared
}

export function makeMissingH1(pages: CrawlPageRow[], count: number, offset = 0): void {
  for (const page of slice(pages, count, offset)) {
    page.h1_text = null
    page.h1_count = 0
  }
}

export function makeMultipleH1(pages: CrawlPageRow[], count: number, offset = 0): void {
  for (const page of slice(pages, count, offset)) page.h1_count = 3
}

export function toEvidence(pages: CrawlPageRow[], crawlRunOverrides: Partial<CrawlRunRow> = {}): CrawlEvidence {
  return { crawlRun: makeCrawlRun({ status: 'completed', ...crawlRunOverrides }), pages, links: [] }
}
