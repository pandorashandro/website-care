import type { CrawlEvidence } from '../evidence'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 26B — hreflang / internationalization. Every check here only ever
 * fires for a page that DECLARED at least one hreflang tag — a site with no
 * hreflang usage at all (the overwhelming majority) triggers nothing here,
 * per this phase's explicit "do not penalize sites that do not need
 * hreflang" instruction.
 *
 * A reasonably permissive, deterministic BCP-47-ish pattern is used for
 * "invalid code" — this is not a full BCP-47 validator (no real registry
 * lookup), but reliably catches the common mistakes (empty values,
 * underscores instead of hyphens, obviously-too-long garbage) without
 * false-flagging legitimate less-common codes.
 */
const VALID_HREFLANG_PATTERN = /^(x-default|[a-z]{2,3}(-[a-z0-9]{2,8})?)$/i

export function analyzeHreflang(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const findings: RawFinding[] = []
  const pagesWithHreflang = evidence.pages.filter((page) => page.status === 'completed' && page.hreflang_tags.length > 0)

  if (pagesWithHreflang.length === 0) return findings

  const invalidCodeInstances: RawFindingPageEvidence[] = []
  const targetErrorInstances: RawFindingPageEvidence[] = []
  const missingReciprocalInstances: RawFindingPageEvidence[] = []

  // Build a reverse index: for each page, which pages (via a resolvable,
  // same-crawl hreflang href) declare a hreflang tag pointing AT it — used
  // by the reciprocal check below.
  const reciprocalTargets = new Map<string, Set<string>>() // targetUrl -> set of source urls that reference it

  for (const page of pagesWithHreflang) {
    for (const tag of page.hreflang_tags) {
      if (!VALID_HREFLANG_PATTERN.test(tag.lang)) {
        invalidCodeInstances.push({
          url: page.url,
          currentState: { label: 'hreflang code', value: tag.lang },
          desiredState: null, // the correct code is a business decision (which locale it should represent), never guessed
          detail: { href: tag.href },
        })
        continue
      }

      const targetPage = context.pageIndex.get(tag.href)
      if (targetPage && (targetPage.status === 'failed' || (typeof targetPage.http_status === 'number' && (targetPage.http_status < 200 || targetPage.http_status >= 300)))) {
        targetErrorInstances.push({
          url: page.url,
          affectedResourceUrl: tag.href,
          currentState: { label: `hreflang (${tag.lang}) target`, value: targetPage.status === 'failed' ? 'unreachable' : `HTTP ${targetPage.http_status}` },
          desiredState: null,
          detail: { lang: tag.lang, href: tag.href },
        })
      }

      if (targetPage) {
        const sources = reciprocalTargets.get(tag.href) ?? new Set<string>()
        sources.add(page.url)
        reciprocalTargets.set(tag.href, sources)
      }
    }
  }

  // Reciprocal check: page A -> B exists; does B declare a hreflang tag
  // back to A? Only evaluated for pairs where BOTH pages were actually
  // discovered by this crawl (an evaluable pair) — never guessed for a
  // target outside this crawl's own evidence.
  for (const [targetUrl, sourceUrls] of reciprocalTargets) {
    const targetPage = context.pageIndex.get(targetUrl)
    if (!targetPage || targetPage.status !== 'completed') continue

    const targetHrefs = new Set(targetPage.hreflang_tags.map((tag) => tag.href))
    for (const sourceUrl of sourceUrls) {
      if (!targetHrefs.has(sourceUrl)) {
        missingReciprocalInstances.push({
          url: sourceUrl,
          affectedResourceUrl: targetUrl,
          currentState: { label: 'Reciprocal hreflang', value: `${targetUrl} does not link back` },
          desiredState: { label: 'Reciprocal hreflang', value: `${targetUrl} should declare hreflang back to ${sourceUrl}` },
          detail: {},
        })
      }
    }
  }

  if (invalidCodeInstances.length > 0) {
    findings.push({
      checkKey: 'hreflang_invalid_code',
      category: 'internationalization',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages declare an invalid hreflang code',
      explanation: `${invalidCodeInstances.length} hreflang tag${invalidCodeInstances.length === 1 ? '' : 's'} declare${invalidCodeInstances.length === 1 ? 's' : ''} a language/region code that does not look like a valid BCP-47 value.`,
      whyItMatters: 'Search engines ignore an hreflang tag with an unrecognized code, silently losing the international targeting it was meant to provide.',
      recommendation: 'Correct each hreflang code to a valid language (and optional region) code, e.g. "en", "en-US", or "x-default".',
      evidence: {},
      affectedPages: invalidCodeInstances,
    })
  }

  if (targetErrorInstances.length > 0) {
    findings.push({
      checkKey: 'hreflang_target_error',
      category: 'internationalization',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'hreflang tags point to broken pages',
      explanation: `${targetErrorInstances.length} hreflang tag${targetErrorInstances.length === 1 ? '' : 's'} point${targetErrorInstances.length === 1 ? 's' : ''} at a URL that returned an error when webioom crawled it.`,
      whyItMatters: 'Search engines cannot use a broken hreflang target, so visitors searching in that language/region may not be shown the intended page.',
      recommendation: 'Update or remove the hreflang tag, or fix the broken destination page.',
      evidence: {},
      affectedPages: targetErrorInstances,
    })
  }

  if (missingReciprocalInstances.length > 0) {
    findings.push({
      checkKey: 'hreflang_missing_reciprocal',
      category: 'internationalization',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'medium',
      title: 'hreflang relationships are not reciprocal',
      explanation: `${missingReciprocalInstances.length} hreflang relationship${missingReciprocalInstances.length === 1 ? '' : 's'} webioom found ${missingReciprocalInstances.length === 1 ? 'is' : 'are'} one-directional — the target page does not declare a matching hreflang tag back to the source.`,
      whyItMatters: 'Search engines generally expect hreflang relationships to be reciprocal; a one-directional link may be ignored.',
      recommendation: 'Add a matching hreflang tag on the target page pointing back to the source page, if this pairing is intentional.',
      evidence: {},
      affectedPages: missingReciprocalInstances,
    })
  }

  return findings
}
