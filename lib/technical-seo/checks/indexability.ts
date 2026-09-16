import type { CrawlEvidence } from '../evidence'
import { isImportantPage } from '../evidence'
import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category B — indexability. Every claim here is scoped to
 * "according to this crawl's own signals" — never "not indexed by Google,"
 * which would require GSC evidence this phase deliberately does not have
 * (out of scope; see the phase's DO NOT BUILD list).
 */
export function analyzeIndexability(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const findings: RawFinding[] = []
  const completed = evidence.pages.filter((page) => page.status === 'completed')

  const noindexPages = completed.filter((page) => page.noindex === true)
  if (noindexPages.length > 0) {
    findings.push({
      checkKey: 'noindex_page',
      category: 'indexability',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Pages are marked noindex',
      explanation: `${noindexPages.length} page${noindexPages.length === 1 ? '' : 's'} explicitly tell${noindexPages.length === 1 ? 's' : ''} search engines not to index them (a noindex directive).`,
      whyItMatters: 'A noindex page cannot appear in search results at all — this is only a problem if it was not meant to be excluded.',
      recommendation: 'Confirm excluding these pages from search results is intentional. If any of them should be discoverable, remove its noindex directive.',
      evidence: {},
      affectedPages: noindexPages.map((page) => ({ url: page.url })),
    })
  }

  const blockedButOtherwiseIndexable = completed.filter(
    (page) => page.robots_allowed === false && page.noindex !== true && (page.http_status === null || (page.http_status >= 200 && page.http_status < 300))
  )
  if (blockedButOtherwiseIndexable.length > 0) {
    findings.push({
      checkKey: 'indexable_page_blocked_by_robots',
      category: 'indexability',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'medium',
      title: 'Pages with no noindex signal are blocked by robots.txt',
      explanation: `${blockedButOtherwiseIndexable.length} page${blockedButOtherwiseIndexable.length === 1 ? '' : 's'} carr${blockedButOtherwiseIndexable.length === 1 ? 'ies' : 'y'} no noindex signal but are disallowed by robots.txt, so search engines cannot crawl them to find out.`,
      whyItMatters: "robots.txt prevents search engines from even fetching the page, which can keep it from appearing in search results even though nothing on the page itself says it shouldn't be indexed.",
      recommendation: 'If these pages should appear in search results, update robots.txt to allow them. If blocking them is intentional, no change is needed.',
      evidence: {},
      affectedPages: blockedButOtherwiseIndexable.map((page) => ({ url: page.url })),
    })
  }

  const conflictingSignalPages = completed.filter((page) => page.noindex === true && page.robots_allowed === false)
  if (conflictingSignalPages.length > 0) {
    findings.push({
      checkKey: 'conflicting_indexability_signals',
      category: 'indexability',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'medium',
      title: 'Pages combine noindex with a robots.txt block',
      explanation: `${conflictingSignalPages.length} page${conflictingSignalPages.length === 1 ? '' : 's'} both carr${conflictingSignalPages.length === 1 ? 'ies' : 'y'} a noindex directive AND ${conflictingSignalPages.length === 1 ? 'is' : 'are'} blocked by robots.txt.`,
      whyItMatters: 'This is usually harmless (both signals agree the page should stay out of search results), but blocking a noindex page in robots.txt can occasionally prevent search engines from ever seeing the noindex tag and fully forgetting an already-indexed page.',
      recommendation: 'If these pages were previously indexed and you want them fully removed from search results, temporarily allow robots.txt access so the noindex tag can be re-crawled, then block it again once removal is confirmed.',
      evidence: {},
      affectedPages: conflictingSignalPages.map((page) => ({ url: page.url })),
    })
  }

  const importantNonIndexable = completed.filter(
    (page) => (page.noindex === true || page.robots_allowed === false) && isImportantPage(page, context.inboundLinkCounts)
  )
  if (importantNonIndexable.length > 0) {
    findings.push({
      checkKey: 'important_page_non_indexable',
      category: 'indexability',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'medium',
      title: 'An important page is not indexable',
      explanation: `${importantNonIndexable.length} page${importantNonIndexable.length === 1 ? '' : 's'} that appear${importantNonIndexable.length === 1 ? 's' : ''} important (the homepage, or linked to from many other pages on your site) ${importantNonIndexable.length === 1 ? 'is' : 'are'} not indexable, due to a noindex directive or a robots.txt block.`,
      whyItMatters: 'A page many other pages link to is usually meant to be found in search results — excluding it may be an oversight rather than a deliberate choice.',
      recommendation: 'Double check that excluding this page from search results is intentional.',
      evidence: {},
      affectedPages: importantNonIndexable.map((page) => ({
        url: page.url,
        detail: { inboundLinkCount: context.inboundLinkCounts.get(page.url) ?? 0, isHomepage: page.depth === 0 },
      })),
    })
  }

  return findings
}
