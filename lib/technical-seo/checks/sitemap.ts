import type { CrawlEvidence } from '../evidence'
import { isImportantPage } from '../evidence'
import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category F — XML sitemaps. Reads crawl_runs.sitemap_status/
 * sitemap_url_count (Phase 26's own additive columns — see their migration
 * comments) and crawl_pages.discovered_via === 'sitemap', which Phase 25
 * already tags every sitemap-seeded page with.
 */
export function analyzeSitemap(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const findings: RawFinding[] = []

  if (evidence.crawlRun.sitemap_status === 'unreachable') {
    findings.push({
      checkKey: 'sitemap_unavailable',
      category: 'sitemap',
      scope: 'site',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'No XML sitemap could be found',
      explanation: "webioom could not find or fetch a sitemap for your site (checked robots.txt's Sitemap: directive and the standard /sitemap.xml location).",
      whyItMatters: 'A sitemap helps search engines discover your important pages more reliably, especially on larger or less well-linked sites.',
      recommendation: 'Create an XML sitemap listing your important pages and reference it from robots.txt.',
      evidence: {},
      affectedPages: [],
    })
    return findings // an unreachable sitemap has no URLs to evaluate further
  }

  if (evidence.crawlRun.sitemap_status === 'empty') {
    findings.push({
      checkKey: 'sitemap_empty',
      category: 'sitemap',
      scope: 'site',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Your sitemap lists no pages',
      explanation: 'webioom found a sitemap file, but it did not contain any usable page URLs.',
      whyItMatters: 'A sitemap with no URLs provides no discovery benefit to search engines.',
      recommendation: 'Add your important page URLs to the sitemap.',
      evidence: {},
      affectedPages: [],
    })
    return findings
  }

  if (evidence.crawlRun.sitemap_status !== 'ok') return findings // no persisted outcome (e.g. a crawl_run created before this column existed)

  const sitemapPages = evidence.pages.filter((page) => page.discovered_via === 'sitemap')

  const errorUrls = sitemapPages.filter(
    (page) => page.status === 'failed' || (page.status === 'completed' && typeof page.http_status === 'number' && (page.http_status < 200 || page.http_status >= 300))
  )
  if (errorUrls.length > 0) {
    findings.push({
      checkKey: 'sitemap_contains_error_url',
      category: 'sitemap',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Your sitemap lists broken URLs',
      explanation: `${errorUrls.length} URL${errorUrls.length === 1 ? '' : 's'} in your sitemap returned an error or could not be reached.`,
      whyItMatters: 'A sitemap is meant to list your best, working pages — broken URLs in it waste search engine crawl attention.',
      recommendation: 'Remove these URLs from your sitemap, or fix the underlying page so it loads correctly.',
      evidence: {},
      affectedPages: errorUrls.map((page) => ({ url: page.url, detail: { httpStatus: page.http_status, fetchFailed: page.status === 'failed' } })),
    })
  }

  const noindexUrls = sitemapPages.filter((page) => page.status === 'completed' && page.noindex === true)
  if (noindexUrls.length > 0) {
    findings.push({
      checkKey: 'sitemap_contains_noindex_url',
      category: 'sitemap',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Your sitemap lists noindex pages',
      explanation: `${noindexUrls.length} URL${noindexUrls.length === 1 ? '' : 's'} in your sitemap ${noindexUrls.length === 1 ? 'is' : 'are'} marked noindex.`,
      whyItMatters: "Listing a noindex page in your sitemap sends search engines a mixed signal — the sitemap says 'crawl this,' the page says 'don't index this.'",
      recommendation: 'Remove noindex pages from your sitemap, or remove the noindex directive if the page should actually be indexed.',
      evidence: {},
      affectedPages: noindexUrls.map((page) => ({ url: page.url })),
    })
  }

  const blockedUrls = sitemapPages.filter((page) => page.status === 'completed' && page.robots_allowed === false)
  if (blockedUrls.length > 0) {
    findings.push({
      checkKey: 'sitemap_contains_blocked_url',
      category: 'sitemap',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Your sitemap lists robots.txt-blocked pages',
      explanation: `${blockedUrls.length} URL${blockedUrls.length === 1 ? '' : 's'} in your sitemap ${blockedUrls.length === 1 ? 'is' : 'are'} disallowed by robots.txt.`,
      whyItMatters: 'Search engines cannot crawl a blocked URL, so listing it in your sitemap has no benefit and sends a mixed signal.',
      recommendation: 'Remove these URLs from your sitemap, or update robots.txt to allow them if they should be crawled.',
      evidence: {},
      affectedPages: blockedUrls.map((page) => ({ url: page.url })),
    })
  }

  const importantMissing = evidence.pages.filter(
    (page) => page.status === 'completed' && page.discovered_via !== 'sitemap' && isImportantPage(page, context.inboundLinkCounts)
  )
  if (importantMissing.length > 0) {
    findings.push({
      checkKey: 'important_page_missing_from_sitemap',
      category: 'sitemap',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'medium',
      title: 'Important pages are missing from your sitemap',
      explanation: `${importantMissing.length} page${importantMissing.length === 1 ? '' : 's'} that appear${importantMissing.length === 1 ? 's' : ''} important (the homepage, or linked to from many other pages) ${importantMissing.length === 1 ? 'was' : 'were'} not found in your sitemap.`,
      whyItMatters: 'Sitemaps help search engines discover and prioritize your most important pages — leaving one out is not necessarily an error, but is often worth including.',
      recommendation: 'Consider adding these pages to your sitemap.',
      evidence: {},
      affectedPages: importantMissing.map((page) => ({ url: page.url, detail: { inboundLinkCount: context.inboundLinkCounts.get(page.url) ?? 0, isHomepage: page.depth === 0 } })),
    })
  }

  return findings
}
