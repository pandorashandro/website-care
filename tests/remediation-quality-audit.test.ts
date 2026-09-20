import { describe, expect, it } from 'vitest'
import { analyzeCrawlability } from '@/lib/technical-seo/checks/crawlability'
import { getActionability as getTechnicalSeoActionability } from '@/lib/technical-seo/actionability'
import { makeEvidence as makeTechnicalSeoEvidence, makePage as makeTechnicalSeoPage } from './helpers/technical-seo-fixtures'
import { analyzeTitleLength } from '@/lib/on-page/checks/title'
import { isOnPageEligiblePage } from '@/lib/on-page/eligibility'
import { getActionability as getOnPageActionability } from '@/lib/on-page/actionability'
import type { AnalyzerContext as OnPageContext } from '@/lib/on-page/context'
import { analyzeThinContent } from '@/lib/content/checks/thin-content'
import { getActionability as getContentActionability } from '@/lib/content/actionability'
import { contentContextFor } from './helpers/content-fixtures'
import { analyzeOrphanPages } from '@/lib/architecture/checks/orphan'
import { getActionability as getArchitectureActionability } from '@/lib/architecture/actionability'
import { buildPageGraph } from '@/lib/architecture/graph'
import type { AnalyzerContext as ArchitectureContext } from '@/lib/architecture/context'
import { makeEvidence as makeArchitectureEvidence, makePage as makeArchitecturePage } from './helpers/architecture-fixtures'
import { analyzeHeavyPageWeight } from '@/lib/performance/checks/heavy-page-weight'
import { analyzeMissingImageAlt } from '@/lib/accessibility/checks/missing-image-alt'
import { analyzeMixedContent } from '@/lib/security/checks/mixed-content'
import { pillarContextFor } from './helpers/pillar-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Structural, not imported from any one engine's own RawFinding type —
 * Technical SEO/On-Page/Content/Architecture each declare their own
 * independent finding type (by design, see each lib/<engine>/types.ts) and
 * — unlike the shared pillars framework (Performance/Accessibility/
 * Security), whose RawFinding carries `actionability` inline — resolve
 * actionability separately via their own getActionability(checkKey), only
 * once findings are aggregated. A single cross-pillar assertion helper must
 * describe only the fields every engine's raw finding actually has.
 */
type FindingLike = {
  explanation: string
  whyItMatters: string
  recommendation: string
  affectedPages: { url: string; affectedResourceUrl?: string | null; detail?: Record<string, unknown> }[]
}

const VALID_ACTIONABILITY = new Set(['safe_fix', 'prepared_fix', 'guided_fix', 'developer_required', 'monitor'])

/**
 * PAYABLE-V1 remediation-depth audit — this is NOT a re-test of each check's
 * own detection logic (already covered by that check's own test file). It
 * locks in the cross-pillar CONTRACT this pass's audit verified: a
 * representative, genuinely triggerable finding from EACH of the seven
 * canonical pillars must have a non-empty explanation/why-it-matters/
 * recommendation, a valid actionability classification, and — where the
 * check's own evidence includes it — a real affected URL/resource, never a
 * bare count with nothing to act on. A future check that regresses to an
 * empty or placeholder field, or an invalid actionability value, fails here
 * even if its own dedicated test file only checks detection behavior.
 */
function assertUsefulFinding(finding: FindingLike | undefined, actionability: string, label: string) {
  expect(finding, `${label}: finding was not produced`).toBeDefined()
  if (!finding) return
  expect(finding.explanation.trim().length, `${label}: explanation must not be empty`).toBeGreaterThan(0)
  expect(finding.whyItMatters.trim().length, `${label}: whyItMatters must not be empty`).toBeGreaterThan(0)
  expect(finding.recommendation.trim().length, `${label}: recommendation must not be empty`).toBeGreaterThan(0)
  expect(VALID_ACTIONABILITY.has(actionability), `${label}: actionability "${actionability}" is not a recognized value`).toBe(true)
  expect(finding.affectedPages.length, `${label}: must identify at least one affected page/resource`).toBeGreaterThan(0)
}

describe('remediation quality — one representative, genuinely useful finding per canonical pillar', () => {
  it('Technical SEO: a page that could not be fetched gets a useful, affected-URL-backed finding', () => {
    const evidence = makeTechnicalSeoEvidence({
      pages: [makeTechnicalSeoPage({ url: 'https://example.com/broken', status: 'failed', error_reason: 'network', http_status: null })],
    })
    const finding = analyzeCrawlability(evidence).find((f) => f.checkKey === 'fetch_failed')
    assertUsefulFinding(finding, finding ? getTechnicalSeoActionability(finding.checkKey) : '', 'Technical SEO (fetch_failed)')
    expect(finding?.affectedPages[0].url).toBe('https://example.com/broken')
  })

  it('On-Page SEO: a page with no title gets a useful, affected-URL-backed finding', () => {
    function contextFor(pages: Parameters<typeof isOnPageEligiblePage>[0][]): OnPageContext {
      return { eligiblePages: pages.filter(isOnPageEligiblePage), totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length, isPartialCrawl: false }
    }
    const page = makeArchitecturePage({ url: 'https://example.com/no-title', title: null })
    const finding = analyzeTitleLength(contextFor([page])).find((f) => f.checkKey === 'missing_title')
    assertUsefulFinding(finding, finding ? getOnPageActionability(finding.checkKey) : '', 'On-Page SEO (missing_title)')
    expect(finding?.affectedPages[0].url).toBe('https://example.com/no-title')
  })

  it('Content: a page with substantially less content than expected gets a useful, affected-URL-backed finding', () => {
    const page = makeArchitecturePage({ url: 'https://example.com/thin', content_word_count: 5, content_hash: 'x' })
    const finding = analyzeThinContent(contentContextFor([page])).find((f) => f.checkKey === 'substantively_thin_page')
    assertUsefulFinding(finding, finding ? getContentActionability(finding.checkKey) : '', 'Content (substantively_thin_page)')
    expect(finding?.affectedPages[0].url).toBe('https://example.com/thin')
  })

  it('Site Architecture: an orphan page gets a useful, affected-URL-backed finding', () => {
    function contextFor(evidence: CrawlEvidence): ArchitectureContext {
      return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl: false }
    }
    const home = makeArchitecturePage({ url: 'https://example.com/', depth: 0 })
    const orphan = makeArchitecturePage({ url: 'https://example.com/forgotten', discovered_via: 'sitemap', depth: 1 })
    const evidence = makeArchitectureEvidence({ pages: [home, orphan] })
    const finding = analyzeOrphanPages(evidence, contextFor(evidence)).find((f) => f.checkKey === 'orphan_page')
    assertUsefulFinding(finding, finding ? getArchitectureActionability(finding.checkKey) : '', 'Site Architecture (orphan_page)')
    expect(finding?.affectedPages[0].url).toBe('https://example.com/forgotten')
  })

  it('Performance: an unusually heavy page gets a useful, affected-URL-backed finding with real script/stylesheet evidence', () => {
    const page = makeArchitecturePage({ url: 'https://example.com/heavy', response_size_bytes: 6_000_000, performance_evidence: { scriptCount: 20, stylesheetCount: 5 } })
    const finding = analyzeHeavyPageWeight(pillarContextFor([page])).find((f) => f.checkKey === 'heavy_page_response')
    assertUsefulFinding(finding, finding?.actionability ?? '', 'Performance (heavy_page_response)')
    expect(finding?.affectedPages[0].url).toBe('https://example.com/heavy')
    expect(finding?.affectedPages[0].detail).toMatchObject({ scriptCount: 20, stylesheetCount: 5 })
  })

  it('Accessibility: an image missing alt text gets a useful, affected-resource-backed finding', () => {
    const page = makeArchitecturePage({
      url: 'https://example.com/gallery',
      accessibility_evidence: { imagesMissingAltCount: 1, imagesMissingAltSrcs: ['https://example.com/photo.jpg'] },
    })
    const finding = analyzeMissingImageAlt(pillarContextFor([page])).find((f) => f.checkKey === 'images_missing_alt')
    assertUsefulFinding(finding, finding?.actionability ?? '', 'Accessibility (images_missing_alt)')
    expect(finding?.affectedPages[0].affectedResourceUrl).toBe('https://example.com/photo.jpg')
  })

  it('Security: a mixed-content reference gets a useful, affected-resource-backed finding', () => {
    const page = makeArchitecturePage({
      url: 'https://example.com/page',
      security_evidence: { isHttps: true, mixedContentCount: 1, mixedContentUrls: ['http://example.com/insecure.js'] },
    })
    const finding = analyzeMixedContent(pillarContextFor([page])).find((f) => f.checkKey === 'mixed_content')
    assertUsefulFinding(finding, finding?.actionability ?? '', 'Security (mixed_content)')
    expect(finding?.affectedPages[0].affectedResourceUrl).toBe('http://example.com/insecure.js')
  })
})
