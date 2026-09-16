import type { CrawlEvidence } from '../evidence'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category H — technical page signals. Deliberately narrow: only
 * a genuinely technical, reliably-evidenced condition (a "successful" page
 * with almost no body and none of title/H1/meta description extracted) is
 * implemented here. Title/heading quality, content depth, and similar
 * on-page judgments belong to Phase 28's On-Page SEO Engine, not this
 * phase — see the check library's own "considered but not implemented"
 * notes for what was deliberately left out and why.
 */
const TINY_PAGE_MAX_BYTES = 500

function isHtmlLikePage(page: { content_type: string | null }): boolean {
  return !page.content_type || page.content_type.toLowerCase().includes('html')
}

export function analyzeTechnicalPageSignals(evidence: CrawlEvidence): RawFinding[] {
  const findings: RawFinding[] = []

  const emptyOrTinyPages = evidence.pages.filter(
    (page) =>
      page.status === 'completed' &&
      typeof page.http_status === 'number' &&
      page.http_status >= 200 &&
      page.http_status < 300 &&
      isHtmlLikePage(page) &&
      typeof page.response_size_bytes === 'number' &&
      page.response_size_bytes <= TINY_PAGE_MAX_BYTES &&
      !page.title &&
      !page.h1_text
  )

  if (emptyOrTinyPages.length > 0) {
    findings.push({
      checkKey: 'empty_or_tiny_page',
      category: 'technical_page',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'medium',
      title: 'Pages return an unexpectedly empty or tiny response',
      explanation: `${emptyOrTinyPages.length} page${emptyOrTinyPages.length === 1 ? '' : 's'} returned a successful response with almost no content — no title, no heading, and a very small response size.`,
      whyItMatters: 'A page with no usable content gives search engines and visitors nothing to work with, even though it technically loaded successfully.',
      recommendation: 'Check whether this page is rendering correctly — it may be failing silently, showing a placeholder, or relying on content that only appears after JavaScript runs.',
      evidence: {},
      affectedPages: emptyOrTinyPages.map((page) => ({ url: page.url, detail: { responseSizeBytes: page.response_size_bytes } })),
    })
  }

  return findings
}
