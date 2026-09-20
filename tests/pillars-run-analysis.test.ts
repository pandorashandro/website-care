import { describe, expect, it } from 'vitest'
import { runPillarAnalysis } from '@/lib/pillars/run-analysis'
import { analyzePerformance } from '@/lib/performance/run-analysis'
import { analyzeAccessibility } from '@/lib/accessibility/run-analysis'
import { analyzeSecurity } from '@/lib/security/run-analysis'
import { createFakePillarStore } from './helpers/fake-pillar-store'
import { makeCrawlRun, makePage } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'
import type { RawFinding } from '@/lib/pillars/types'
import type { PillarAnalyzerContext } from '@/lib/pillars/context'

const CRAWL_RUN_ID = 'crawl-run-1'

describe('runPillarAnalysis — shared orchestration', () => {
  it('rejects analysis for a crawl_run that does not exist', async () => {
    const store = createFakePillarStore({})
    const result = await runPillarAnalysis('performance', 'performance-v1', [], store, 'does-not-exist')
    expect(result.ok).toBe(false)
  })

  it('rejects analysis for a crawl still queued/running', async () => {
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'running' }), pages: [], links: [] }
    const store = createFakePillarStore({ [CRAWL_RUN_ID]: evidence })
    const result = await runPillarAnalysis('performance', 'performance-v1', [], store, CRAWL_RUN_ID)
    expect(result.ok).toBe(false)
  })

  it('one throwing check is isolated — the other checks\' findings still persist', async () => {
    const page = makePage({ url: 'https://example.com/' })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakePillarStore({ [CRAWL_RUN_ID]: evidence })

    const throwingCheck = () => {
      throw new Error('boom')
    }
    const workingCheck = (): RawFinding[] => [
      {
        checkKey: 'test_finding',
        category: 'test',
        scope: 'page',
        kind: 'problem',
        evidenceSource: 'deterministic',
        baseSeverity: 'low',
        confidence: 'high',
        title: 'x',
        explanation: 'x',
        whyItMatters: 'x',
        recommendation: 'x',
        evidence: {},
        actionability: 'monitor',
        affectedPages: [{ url: page.url }],
      },
    ]

    const result = await runPillarAnalysis('performance', 'performance-v1', [throwingCheck, workingCheck], store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'test_finding')).toBe(true)
  })

  it('opportunity-kind findings never reduce the health score', async () => {
    const page = makePage({ url: 'https://example.com/' })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakePillarStore({ [CRAWL_RUN_ID]: evidence })

    const opportunityCheck = (): RawFinding[] => [
      {
        checkKey: 'opportunity_finding',
        category: 'test',
        scope: 'site',
        kind: 'opportunity',
        evidenceSource: 'deterministic',
        baseSeverity: 'critical', // even a "critical" severity opportunity must not deduct
        confidence: 'high',
        title: 'x',
        explanation: 'x',
        whyItMatters: 'x',
        recommendation: 'x',
        evidence: {},
        actionability: 'monitor',
        affectedPages: [],
      },
    ]

    const result = await runPillarAnalysis('performance', 'performance-v1', [opportunityCheck], store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.score).toBe(100)
  })

  it('excludes ineligible pages (noindex) from analysis entirely', async () => {
    const eligible = makePage({ url: 'https://example.com/a', accessibility_evidence: { imagesMissingAltCount: 1 } })
    const ineligible = makePage({ url: 'https://example.com/b', accessibility_evidence: { imagesMissingAltCount: 1 }, noindex: true })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [eligible, ineligible], links: [] }
    const store = createFakePillarStore({ [CRAWL_RUN_ID]: evidence })

    const checkSpy = (context: PillarAnalyzerContext) => {
      expect(context.eligiblePages).toHaveLength(1)
      expect(context.eligiblePages[0].url).toBe('https://example.com/a')
      return []
    }

    await runPillarAnalysis('accessibility', 'accessibility-v1', [checkSpy], store, CRAWL_RUN_ID)
  })
})

describe('Performance/Accessibility/Security — real analyzer wiring, insufficient-evidence and clean-site behavior', () => {
  it('analyzePerformance produces a clean (score 100) result plus the always-on Core Web Vitals notice for a healthy site', async () => {
    const page = makePage({ url: 'https://example.com/', response_size_bytes: 10_000, performance_evidence: { responseContentEncoding: 'gzip', responseCacheControl: 'max-age=3600' } })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakePillarStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzePerformance(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.score).toBe(100)
    expect(result.findings.some((f) => f.checkKey === 'core_web_vitals_not_measured')).toBe(true)
  })

  it('analyzeAccessibility produces a real problem finding for a page with missing alt text and deducts health', async () => {
    const page = makePage({ url: 'https://example.com/', accessibility_evidence: { imagesMissingAltCount: 5 } })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakePillarStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeAccessibility(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'images_missing_alt')).toBe(true)
    expect(result.health.score).toBeLessThan(100)
  })

  it('analyzeSecurity flags a non-https page and never labels the result "secure"', async () => {
    const page = makePage({ url: 'http://example.com/', security_evidence: { isHttps: false } })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakePillarStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeSecurity(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'not_using_https')).toBe(true)
    expect(result.findings.every((f) => !f.explanation.toLowerCase().includes('your site is secure'))).toBe(true)
  })
})
