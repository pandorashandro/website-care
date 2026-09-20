import { randomUUID } from 'node:crypto'
import type { CrawlRunRow, CrawlPageRow, CrawlLinkRow } from '@/lib/crawler/types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/** Phase 27 test fixtures — deterministic, in-memory crawl evidence builders, mirroring tests/helpers/technical-seo-fixtures.ts's own precedent, so architecture analyzer tests can construct exactly the crawl_pages/crawl_links shape they need. */

/**
 * Phase 29 — a default "healthy, substantive page" content sample (3
 * paragraphs, comfortably above every Content Intelligence thin-content
 * threshold) so tests unrelated to Content Intelligence (Architecture,
 * On-Page) get a plausible default without needing to know about it, and so
 * Content tests that DON'T care about a specific page's content still get a
 * safe, non-thin baseline. Mirrors the existing `title: 'A page'` default's
 * own convention exactly: every default-created page shares this SAME text
 * (and therefore the same content_hash) — tests that need distinct,
 * non-duplicate content across multiple pages must override content_text
 * (and content_hash) explicitly, exactly as duplicate-title tests already
 * override the shared default `title` when they need uniqueness.
 */
const DEFAULT_CONTENT_TEXT = [
  'This page explains what our service includes and who it is designed for, with enough detail that a visitor can understand the offering without contacting us first.',
  'Our process starts with an initial consultation, followed by a tailored plan, then delivery and ongoing support so results are measurable and repeatable.',
  'Clients typically see improvements within the first few weeks, and our team provides regular updates throughout the engagement so nothing is left unclear.',
].join('\n\n')

function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).length
}

const DEFAULT_CONTENT_WORD_COUNT = countWords(DEFAULT_CONTENT_TEXT)

export function makeCrawlRun(overrides: Partial<CrawlRunRow> = {}): CrawlRunRow {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    website_id: 'website-1',
    status: 'completed',
    requested_page_budget: 100,
    effective_page_budget: 100,
    max_depth: 5,
    pages_discovered: 0,
    pages_processed: 0,
    pages_succeeded: 0,
    pages_failed: 0,
    pages_skipped: 0,
    failure_summary: null,
    crawler_version: 'v1',
    created_at: now,
    started_at: now,
    completed_at: now,
    updated_at: now,
    robots_status: 'ok',
    sitemap_status: 'ok',
    sitemap_url_count: 0,
    ...overrides,
  }
}

export function makePage(overrides: Partial<CrawlPageRow> & { url: string }): CrawlPageRow {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    crawl_run_id: 'crawl-run-1',
    website_id: 'website-1',
    discovered_url: null,
    final_url: overrides.url,
    depth: 1,
    discovered_via: 'link',
    status: 'completed',
    claimed_at: null,
    http_status: 200,
    content_type: 'text/html',
    canonical_url: null,
    robots_allowed: true,
    noindex: false,
    title: 'A page',
    meta_description: 'A description',
    h1_text: 'A heading',
    response_time_ms: 100,
    response_size_bytes: 2048,
    error_reason: null,
    discovered_at: now,
    fetched_at: now,
    redirect_count: 0,
    structured_data_present: false,
    structured_data_valid: null,
    structured_data_error: null,
    hreflang_tags: [],
    h1_count: 1,
    content_text: DEFAULT_CONTENT_TEXT,
    content_word_count: DEFAULT_CONTENT_WORD_COUNT,
    content_paragraph_count: 3,
    content_heading_texts: ['Why Choose Us', 'Our Process'],
    content_hash: 'default-healthy-page-content-hash',
    content_extraction_confidence: 'high',
    performance_evidence: {},
    accessibility_evidence: {},
    security_evidence: {},
    ...overrides,
  }
}

export function makeLink(overrides: Partial<CrawlLinkRow> & { source_page_id: string; target_url: string }): CrawlLinkRow {
  return {
    id: randomUUID(),
    crawl_run_id: 'crawl-run-1',
    link_type: 'internal',
    target_page_id: null,
    anchor_text: null,
    discovered_at: new Date().toISOString(),
    ...overrides,
  }
}

export function makeEvidence(input: { crawlRun?: Partial<CrawlRunRow>; pages: CrawlPageRow[]; links?: CrawlLinkRow[] }): CrawlEvidence {
  return {
    crawlRun: makeCrawlRun(input.crawlRun),
    pages: input.pages,
    links: input.links ?? [],
  }
}

/** Convenience: builds an internal link edge from a source page object to a target URL, deriving source_page_id automatically. */
export function linkFrom(sourcePage: CrawlPageRow, targetUrl: string, overrides: Partial<CrawlLinkRow> = {}): CrawlLinkRow {
  return makeLink({ source_page_id: sourcePage.id, target_url: targetUrl, ...overrides })
}
