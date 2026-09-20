import { describe, expect, it, vi } from 'vitest'
import { analyzeContent } from '@/lib/content/run-analysis'
import { createFakeContentStore } from './helpers/fake-content-store'
import { makeCrawlRun, makePage } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'
import { AI_WALL_CLOCK_BUDGET_MS, type CompletenessAiHook } from '@/lib/content/checks/completeness-ai'

const CRAWL_RUN_ID = 'crawl-run-1'

function substantivePage(index: number) {
  return makePage({
    url: `https://example.com/p${index}`,
    content_word_count: 200,
    content_text: `Unique substantive content for page ${index} describing exactly what this page covers in real detail, more than enough words for AI review eligibility here.`,
    content_hash: `unique-hash-${index}`,
  })
}

describe('analyzeContent — optional AI completeness hook (wired into production via content-actions.ts; the injection seam itself stays optional for tests)', () => {
  it('does NOT invoke any AI hook when none is provided — Content Completeness stays not_assessed', async () => {
    const page = substantivePage(0)
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeContent(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'content_completeness_gap' || f.checkKey === 'content_completeness_opportunity')).toBe(false)
  })

  it('when a hook IS provided, produces an AI-interpreted finding with evidenceSource "ai_interpreted"', async () => {
    const page = substantivePage(0)
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const hook: CompletenessAiHook = vi.fn().mockResolvedValue({ status: 'interpreted', missingDimensions: ['proof_examples'], confidence: 'high', explanation: 'No examples given.' })
    const result = await analyzeContent(store, CRAWL_RUN_ID, { completenessAiHook: hook })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // INITIAL RELEASE POLICY: even a 'high'-AI-confidence result becomes an
    // opportunity (content_completeness_opportunity), never a scored
    // problem (content_completeness_gap) — see completeness-ai.ts's own
    // doc comment.
    const finding = result.findings.find((f) => f.checkKey === 'content_completeness_opportunity')
    expect(finding).toBeDefined()
    expect(finding?.evidenceSource).toBe('ai_interpreted')
    expect(finding?.kind).toBe('opportunity')
    expect(result.findings.find((f) => f.checkKey === 'content_completeness_gap')).toBeUndefined()
    expect(hook).toHaveBeenCalled()
  })

  it('AI FAILURE MUST NOT MAKE THE WHOLE CONTENT ANALYSIS FAIL — deterministic findings survive when the hook throws', async () => {
    const thinPage = makePage({ url: 'https://example.com/thin', content_word_count: 10 })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [thinPage], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const throwingHook: CompletenessAiHook = vi.fn().mockRejectedValue(new Error('AI provider exploded'))
    const result = await analyzeContent(store, CRAWL_RUN_ID, { completenessAiHook: throwingHook })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The deterministic thin-content finding is still present despite the AI hook failing entirely.
    expect(result.findings.some((f) => f.checkKey === 'substantively_thin_page')).toBe(true)
  })

  it('AI unavailable (hook resolves "unavailable") also leaves deterministic analysis fully intact', async () => {
    const thinPage = makePage({ url: 'https://example.com/thin', content_word_count: 10 })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [thinPage], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const unavailableHook: CompletenessAiHook = vi.fn().mockResolvedValue({ status: 'unavailable', reason: 'AI interpretation unavailable (timeout).' })
    const result = await analyzeContent(store, CRAWL_RUN_ID, { completenessAiHook: unavailableHook })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'substantively_thin_page')).toBe(true)
    expect(result.findings.some((f) => f.checkKey.startsWith('content_completeness'))).toBe(false)
  })

  it('BUDGET-BOUNDED COVERAGE: reviews only up to AI_MAX_PAGES_PER_ANALYSIS pages, and the finding\'s evidence records honest partial coverage', async () => {
    const pages = Array.from({ length: 15 }, (_, i) => substantivePage(i))
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages, links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const hook: CompletenessAiHook = vi.fn().mockResolvedValue({ status: 'interpreted', missingDimensions: ['proof_examples'], confidence: 'high', explanation: 'No examples given.' })
    const result = await analyzeContent(store, CRAWL_RUN_ID, { completenessAiHook: hook })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 15 eligible pages exist, but only a bounded subset should ever be reviewed.
    expect(hook).toHaveBeenCalledTimes(10)
    const finding = result.findings.find((f) => f.checkKey === 'content_completeness_opportunity')
    expect(finding?.evidence).toMatchObject({ pagesReviewed: 10, pagesEligible: 15 })
  })

  it('PERFORMANCE REQUIREMENT (unified engine, Prompt 2): a wall-clock budget stops making further AI calls once exceeded, so one slow AI pass cannot make the whole unified scan unusably slow — already-collected results still count', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => substantivePage(i))
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages, links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const realDateNow = Date.now
    let callCount = 0
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      // First call establishes `startedAt`; every call thereafter advances
      // time past the budget after just 3 hook invocations, simulating a
      // slow AI provider without a real 25s test.
      callCount++
      return callCount <= 2 ? realDateNow() : realDateNow() + AI_WALL_CLOCK_BUDGET_MS + 1
    })

    const hook: CompletenessAiHook = vi.fn().mockResolvedValue({ status: 'interpreted', missingDimensions: ['proof_examples'], confidence: 'high', explanation: 'x' })
    const result = await analyzeContent(store, CRAWL_RUN_ID, { completenessAiHook: hook })
    dateNowSpy.mockRestore()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The budget check happens before the FIRST hook call inside the loop
    // too (after the initial Date.now() reads as "now"), so only the very
    // first page is reviewed before the simulated clock jump stops the rest.
    expect(hook).toHaveBeenCalledTimes(1)
    const finding = result.findings.find((f) => f.checkKey === 'content_completeness_opportunity')
    expect(finding?.evidence).toMatchObject({ pagesReviewed: 1, pagesEligible: 10 })
  })

  it('an AI-derived finding NEVER affects Content Health in this release — even a "high"-self-reported-confidence result is kind:"opportunity", never kind:"problem"', async () => {
    const page = substantivePage(0)
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const hook: CompletenessAiHook = vi.fn().mockResolvedValue({ status: 'interpreted', missingDimensions: ['proof_examples'], confidence: 'high', explanation: 'x' })
    const result = await analyzeContent(store, CRAWL_RUN_ID, { completenessAiHook: hook })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const finding = result.findings.find((f) => f.checkKey === 'content_completeness_opportunity')
    expect(finding?.kind).toBe('opportunity')
    expect(result.health.score).toBe(100)
  })

  it('a low/medium-confidence AI interpretation becomes an OPPORTUNITY (zero score impact), never a problem', async () => {
    const page = substantivePage(0)
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const hook: CompletenessAiHook = vi.fn().mockResolvedValue({ status: 'interpreted', missingDimensions: ['common_questions'], confidence: 'low', explanation: 'x' })
    const result = await analyzeContent(store, CRAWL_RUN_ID, { completenessAiHook: hook })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const finding = result.findings.find((f) => f.checkKey === 'content_completeness_opportunity')
    expect(finding?.kind).toBe('opportunity')
    expect(result.findings.find((f) => f.checkKey === 'content_completeness_gap')).toBeUndefined()
  })
})
