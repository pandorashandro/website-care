import { describe, expect, it } from 'vitest'
import { analyzeHeavyPageWeight } from '@/lib/performance/checks/heavy-page-weight'
import { analyzeRenderBlockingResources } from '@/lib/performance/checks/render-blocking-resources'
import { analyzeImageDimensions } from '@/lib/performance/checks/image-dimensions'
import { analyzeLazyLoadingOpportunity } from '@/lib/performance/checks/lazy-loading-opportunity'
import { analyzeMissingCompression } from '@/lib/performance/checks/missing-compression'
import { analyzeMissingCachingOpportunity } from '@/lib/performance/checks/missing-caching-opportunity'
import { analyzeCoreWebVitalsNotice } from '@/lib/performance/checks/core-web-vitals-notice'
import { pillarContextFor } from './helpers/pillar-fixtures'
import { makePage } from './helpers/architecture-fixtures'

describe('Performance checks', () => {
  it('flags a page over the heavy-weight threshold, at "high" severity when very heavy', () => {
    const page = makePage({ url: 'https://example.com/a', response_size_bytes: 6_000_000 })
    const finding = analyzeHeavyPageWeight(pillarContextFor([page])).find((f) => f.checkKey === 'heavy_page_response')
    expect(finding?.baseSeverity).toBe('high')
    expect(finding?.kind).toBe('problem')
  })

  it('does not flag a normal-sized page', () => {
    const page = makePage({ url: 'https://example.com/a', response_size_bytes: 50_000 })
    expect(analyzeHeavyPageWeight(pillarContextFor([page]))).toEqual([])
  })

  it('flags render-blocking head scripts and never counts a deferred/async one', () => {
    const blocking = makePage({ url: 'https://example.com/a', performance_evidence: { renderBlockingScriptCount: 3 } })
    const clean = makePage({ url: 'https://example.com/b', performance_evidence: { renderBlockingScriptCount: 0 } })
    expect(analyzeRenderBlockingResources(pillarContextFor([blocking]))).toHaveLength(1)
    expect(analyzeRenderBlockingResources(pillarContextFor([clean]))).toEqual([])
  })

  it('flags images missing width/height as a low-severity problem', () => {
    const page = makePage({ url: 'https://example.com/a', performance_evidence: { imagesMissingDimensionsCount: 2 } })
    const finding = analyzeImageDimensions(pillarContextFor([page]))[0]
    expect(finding.baseSeverity).toBe('low')
    expect(finding.kind).toBe('problem')
  })

  it('lazy-loading is an OPPORTUNITY, never a scored problem', () => {
    const page = makePage({ url: 'https://example.com/a', performance_evidence: { imagesMissingLazyLoadingCount: 4 } })
    const finding = analyzeLazyLoadingOpportunity(pillarContextFor([page]))[0]
    expect(finding.kind).toBe('opportunity')
  })

  it('REMEDIATION-DEPTH FIX: lazy-loading has a concrete, evidence-based fix and no intent to guess, so it is guided_fix, not monitor', () => {
    const page = makePage({ url: 'https://example.com/a', performance_evidence: { imagesMissingLazyLoadingCount: 4 } })
    const finding = analyzeLazyLoadingOpportunity(pillarContextFor([page]))[0]
    expect(finding.actionability).toBe('guided_fix')
  })

  it('REMEDIATION-DEPTH FIX: heavy page weight propagates the page\'s own script/stylesheet counts as real, non-fabricated evidence toward what might be contributing to the size', () => {
    const page = makePage({
      url: 'https://example.com/a',
      response_size_bytes: 6_000_000,
      performance_evidence: { scriptCount: 12, stylesheetCount: 4 },
    })
    const finding = analyzeHeavyPageWeight(pillarContextFor([page]))[0]
    expect(finding.affectedPages[0].detail).toMatchObject({ scriptCount: 12, stylesheetCount: 4 })
  })

  it('flags missing compression only above the minimum size threshold', () => {
    const big = makePage({ url: 'https://example.com/a', response_size_bytes: 100_000, performance_evidence: { responseContentEncoding: null } })
    const small = makePage({ url: 'https://example.com/b', response_size_bytes: 1_000, performance_evidence: { responseContentEncoding: null } })
    expect(analyzeMissingCompression(pillarContextFor([big]))).toHaveLength(1)
    expect(analyzeMissingCompression(pillarContextFor([small]))).toEqual([])
  })

  it('does not flag a page that IS compressed', () => {
    const page = makePage({ url: 'https://example.com/a', response_size_bytes: 100_000, performance_evidence: { responseContentEncoding: 'gzip' } })
    expect(analyzeMissingCompression(pillarContextFor([page]))).toEqual([])
  })

  it('missing caching headers is an OPPORTUNITY, never a scored problem', () => {
    const page = makePage({ url: 'https://example.com/a', performance_evidence: { responseCacheControl: null } })
    const finding = analyzeMissingCachingOpportunity(pillarContextFor([page]))[0]
    expect(finding.kind).toBe('opportunity')
  })

  it('the Core Web Vitals notice is always emitted (when pages exist) and never fabricates a CWV score', () => {
    const page = makePage({ url: 'https://example.com/a' })
    const finding = analyzeCoreWebVitalsNotice(pillarContextFor([page]))[0]
    expect(finding.checkKey).toBe('core_web_vitals_not_measured')
    expect(finding.kind).toBe('opportunity')
    expect(finding.explanation).not.toMatch(/\bLCP\b.*\d/) // never a fabricated numeric LCP/INP/CLS value
  })

  it('emits nothing when there are zero eligible pages', () => {
    expect(analyzeCoreWebVitalsNotice(pillarContextFor([]))).toEqual([])
  })
})
