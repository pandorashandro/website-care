import { normalizeUrl } from '@/lib/scanner/url-utils'
import type { CrawlEvidence } from '../evidence'
import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category C — canonicals. Cross-references each page's own
 * canonical_url against the OTHER pages this same crawl discovered (via
 * AnalyzerContext.pageIndex) to find canonical-target problems, entirely
 * from already-persisted evidence — no new fetch of the canonical target is
 * ever made. A canonical pointing outside this crawl's own discovered pages
 * (a different site entirely, or a same-site page the crawl budget never
 * reached) cannot be evaluated for target health and is not claimed to be
 * broken — only genuinely observable conditions are reported.
 *
 * Phase 26B additions: `canonical_http_downgrade` (a legacy scanner check —
 * `canonical_http` in lib/scanner/issue-definitions.ts — genuinely
 * belonging to Technical SEO under the locked Bible, migrated/adapted here
 * rather than left stranded under the legacy report's generic "seo"
 * bucket — see docs/technical-seo-legacy-classification.md), plus typed
 * current/desired state on every instance (Checkpoint 6).
 */
function isHtmlLikePage(page: { content_type: string | null }): boolean {
  return !page.content_type || page.content_type.toLowerCase().includes('html')
}

export function analyzeCanonicals(evidence: CrawlEvidence, context: AnalyzerContext): RawFinding[] {
  const findings: RawFinding[] = []
  const successfulHtmlPages = evidence.pages.filter(
    (page) => page.status === 'completed' && typeof page.http_status === 'number' && page.http_status >= 200 && page.http_status < 300 && isHtmlLikePage(page)
  )

  const missingCanonical = successfulHtmlPages.filter((page) => !page.canonical_url)
  if (missingCanonical.length > 0) {
    findings.push({
      checkKey: 'missing_canonical',
      category: 'canonicals',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages have no canonical tag',
      explanation: `${missingCanonical.length} page${missingCanonical.length === 1 ? '' : 's'} webioom crawled ${missingCanonical.length === 1 ? 'has' : 'have'} no canonical link tag.`,
      whyItMatters: 'A canonical tag tells search engines which URL is the preferred version of a page — without one, search engines have to guess, which can dilute ranking signals across near-duplicate URLs.',
      recommendation: 'Add a <link rel="canonical"> tag to each page, pointing to its own preferred URL.',
      evidence: {},
      affectedPages: missingCanonical.map((page) => ({
        url: page.url,
        currentState: { label: 'Canonical tag', value: null },
        desiredState: { label: 'Recommended canonical', value: page.final_url ?? page.url },
        proposedChange: `Add <link rel="canonical" href="${page.final_url ?? page.url}">.`,
        remediationType: 'canonical_change',
      })),
    })
  }

  const withCanonical = successfulHtmlPages.filter((page): page is typeof page & { canonical_url: string } => !!page.canonical_url)

  const invalidCanonical: typeof withCanonical = []
  const crossDomainCanonical: typeof withCanonical = []
  const httpDowngradeCanonical: Array<{ page: (typeof withCanonical)[number]; resolved: string }> = []
  const canonicalTargetError: Array<{ page: (typeof withCanonical)[number]; targetStatus: number | null; targetFailed: boolean }> = []
  const canonicalTargetNonIndexable: Array<{ page: (typeof withCanonical)[number]; reason: 'noindex' | 'robots_blocked' }> = []

  for (const page of withCanonical) {
    const resolved = normalizeUrl(page.canonical_url, page.final_url ?? page.url)
    if (!resolved) {
      invalidCanonical.push(page)
      continue
    }

    let pageUrl: URL
    let canonicalUrl: URL
    try {
      pageUrl = new URL(page.final_url ?? page.url)
      canonicalUrl = new URL(resolved)
    } catch {
      invalidCanonical.push(page)
      continue
    }

    if (canonicalUrl.hostname.toLowerCase() !== pageUrl.hostname.toLowerCase()) {
      crossDomainCanonical.push(page)
      continue // a cross-domain target can't be meaningfully checked against this crawl's own pages
    }

    if (pageUrl.protocol === 'https:' && canonicalUrl.protocol === 'http:') {
      httpDowngradeCanonical.push({ page, resolved })
      // A same-host http-downgrade canonical can still legitimately be
      // evaluated further below (it may ALSO point at a broken/non-indexable
      // target) — no `continue` here, unlike cross-domain.
    }

    const targetPage = context.pageIndex.get(resolved)
    if (!targetPage) continue // target outside what this crawl discovered — not evaluable, not claimed to be broken

    // Scoring Engine V2 false-positive fix (2026-09-24): a SELF-referencing
    // canonical (the target IS this same page) can never be a "broken" or
    // "non-indexable target" finding — a noindex page correctly
    // self-canonicalizing (textbook-correct configuration for an
    // intentionally excluded utility page, e.g. a thank-you/confirmation
    // page) was previously flagged as "canonical target is non-indexable,"
    // which is tautological: the page is simply declaring itself as its
    // own canonical, non-indexed version of itself. Whether THIS page
    // itself is noindex is already, separately, exactly what
    // indexability.ts's own noindex_page check evaluates — this check's
    // actual job is cross-referencing a DIFFERENT page's canonical target,
    // which self-reference is not.
    if (targetPage === page) continue

    if (targetPage.status === 'failed' || (typeof targetPage.http_status === 'number' && (targetPage.http_status < 200 || targetPage.http_status >= 300))) {
      canonicalTargetError.push({ page, targetStatus: targetPage.http_status, targetFailed: targetPage.status === 'failed' })
    } else if (targetPage.noindex === true) {
      canonicalTargetNonIndexable.push({ page, reason: 'noindex' })
    } else if (targetPage.robots_allowed === false) {
      canonicalTargetNonIndexable.push({ page, reason: 'robots_blocked' })
    }
  }

  if (invalidCanonical.length > 0) {
    findings.push({
      checkKey: 'invalid_canonical',
      category: 'canonicals',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages have an invalid canonical URL',
      explanation: `${invalidCanonical.length} page${invalidCanonical.length === 1 ? '' : 's'} declare${invalidCanonical.length === 1 ? 's' : ''} a canonical tag that does not resolve to a valid, absolute http or https URL.`,
      whyItMatters: 'Search engines cannot follow a malformed canonical, so it is effectively ignored — the page gets no benefit from having one.',
      recommendation: 'Fix each canonical tag so it contains a complete, valid http or https URL.',
      evidence: {},
      affectedPages: invalidCanonical.map((page) => ({
        url: page.url,
        currentState: { label: 'Declared canonical', value: page.canonical_url },
        desiredState: { label: 'Recommended canonical', value: page.final_url ?? page.url },
        proposedChange: `Fix the canonical tag to a valid, absolute URL (e.g. ${page.final_url ?? page.url}).`,
        remediationType: 'canonical_change',
        detail: { declaredCanonical: page.canonical_url },
      })),
    })
  }

  if (crossDomainCanonical.length > 0) {
    findings.push({
      checkKey: 'canonical_cross_domain',
      category: 'canonicals',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'medium',
      title: 'Pages have a canonical pointing to another domain',
      explanation: `${crossDomainCanonical.length} page${crossDomainCanonical.length === 1 ? '' : 's'} declare${crossDomainCanonical.length === 1 ? 's' : ''} a canonical tag pointing to a different domain.`,
      whyItMatters: 'A cross-domain canonical tells search engines a DIFFERENT site owns this content — sometimes intentional (e.g. syndicated content), but worth confirming since it can also remove a page from your own search results by mistake.',
      recommendation: 'Confirm each cross-domain canonical is intentional. If not, update it to point to the correct URL on this site.',
      evidence: {},
      affectedPages: crossDomainCanonical.map((page) => ({
        url: page.url,
        currentState: { label: 'Declared canonical', value: page.canonical_url },
        desiredState: null, // intent-dependent — never guessed
        detail: { declaredCanonical: page.canonical_url },
      })),
    })
  }

  if (httpDowngradeCanonical.length > 0) {
    findings.push({
      checkKey: 'canonical_http_downgrade',
      category: 'canonicals',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Canonical tags use insecure HTTP on an HTTPS page',
      explanation: `${httpDowngradeCanonical.length} page${httpDowngradeCanonical.length === 1 ? '' : 's'} served over HTTPS declare${httpDowngradeCanonical.length === 1 ? 's' : ''} a canonical tag pointing to the insecure HTTP version of the same URL.`,
      whyItMatters: 'A canonical should point to the actual preferred (HTTPS) version — an HTTP canonical can signal the wrong protocol as preferred and undermine your HTTPS migration.',
      recommendation: 'Update the canonical tag to use https:// instead of http://.',
      evidence: {},
      affectedPages: httpDowngradeCanonical.map(({ page, resolved }) => ({
        url: page.url,
        currentState: { label: 'Declared canonical', value: resolved },
        desiredState: { label: 'Recommended canonical', value: resolved.replace(/^http:/, 'https:') },
        proposedChange: `Change the canonical tag from ${resolved} to ${resolved.replace(/^http:/, 'https:')}.`,
        remediationType: 'canonical_change',
      })),
    })
  }

  if (canonicalTargetError.length > 0) {
    findings.push({
      checkKey: 'canonical_target_error',
      category: 'canonicals',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Canonical tags point to a broken page',
      explanation: `${canonicalTargetError.length} page${canonicalTargetError.length === 1 ? '' : 's'} declare${canonicalTargetError.length === 1 ? 's' : ''} a canonical URL that itself returned an error when webioom crawled it.`,
      whyItMatters: 'A canonical tag is a promise that the target is the real, preferred page — pointing it at a broken URL can keep the page out of search results entirely.',
      recommendation: 'Update each canonical to reference the preferred LIVE version of the page, or restore the intended canonical target.',
      evidence: {},
      affectedPages: canonicalTargetError.map(({ page, targetStatus, targetFailed }) => ({
        url: page.url,
        affectedResourceUrl: page.canonical_url,
        currentState: {
          label: 'Canonical target state',
          value: targetFailed ? 'unreachable' : `HTTP ${targetStatus}`,
        },
        desiredState: { label: 'Recommended canonical', value: page.final_url ?? page.url },
        proposedChange: `Update the canonical to reference a live page, e.g. ${page.final_url ?? page.url}.`,
        remediationType: 'canonical_change',
        detail: { declaredCanonical: page.canonical_url, targetStatus, targetFetchFailed: targetFailed },
      })),
    })
  }

  if (canonicalTargetNonIndexable.length > 0) {
    findings.push({
      checkKey: 'canonical_target_non_indexable',
      category: 'canonicals',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Canonical tags point to a non-indexable page',
      explanation: `${canonicalTargetNonIndexable.length} page${canonicalTargetNonIndexable.length === 1 ? '' : 's'} declare${canonicalTargetNonIndexable.length === 1 ? 's' : ''} a canonical URL that is itself excluded from indexing.`,
      whyItMatters: 'If the canonical target cannot be indexed, neither this page nor its target is likely to appear in search results.',
      recommendation: 'Point the canonical to a page that is actually indexable, or remove the noindex/robots block from the intended canonical target.',
      evidence: {},
      affectedPages: canonicalTargetNonIndexable.map(({ page, reason }) => ({
        url: page.url,
        affectedResourceUrl: page.canonical_url,
        currentState: { label: 'Canonical target indexability', value: reason === 'noindex' ? 'noindex' : 'blocked by robots.txt' },
        desiredState: null,
        detail: { declaredCanonical: page.canonical_url, reason },
      })),
    })
  }

  return findings
}
