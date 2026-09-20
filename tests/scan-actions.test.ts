import { describe, expect, it, vi } from 'vitest'
import { summarizeCategoryAnalysisOutcomes, type CanonicalCategoryKey } from '@/app/dashboard/websites/[id]/scan-orchestration'

const ALL_CATEGORIES: CanonicalCategoryKey[] = ['technical_seo', 'on_page_seo', 'site_architecture', 'content']

function fulfilled<T>(value: T): PromiseSettledResult<T> {
  return { status: 'fulfilled', value }
}

function rejected(reason: unknown): PromiseSettledResult<never> {
  return { status: 'rejected', reason }
}

describe('summarizeCategoryAnalysisOutcomes — unified scan partial-failure handling', () => {
  it('reports every category ok when every analyzer succeeds', () => {
    const results = summarizeCategoryAnalysisOutcomes(ALL_CATEGORIES, [fulfilled({ ok: true }), fulfilled({ ok: true }), fulfilled({ ok: true }), fulfilled({ ok: true })])
    expect(results).toEqual(ALL_CATEGORIES.map((category) => ({ category, ok: true })))
  })

  it('ONE analyzer returning {ok:false} does not affect the other three successful results — partial failure never destroys successful results', () => {
    const results = summarizeCategoryAnalysisOutcomes(ALL_CATEGORIES, [
      fulfilled({ ok: true }),
      fulfilled({ ok: false, error: 'Crawl not found.' }),
      fulfilled({ ok: true }),
      fulfilled({ ok: true }),
    ])
    expect(results[0]).toEqual({ category: 'technical_seo', ok: true })
    expect(results[1]).toEqual({ category: 'on_page_seo', ok: false, error: 'Crawl not found.' })
    expect(results[2]).toEqual({ category: 'site_architecture', ok: true })
    expect(results[3]).toEqual({ category: 'content', ok: true })
  })

  it('a THROWN exception (rejected promise) is represented as an honest failure, never silently dropped or mistaken for success', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const results = summarizeCategoryAnalysisOutcomes(ALL_CATEGORIES, [
      fulfilled({ ok: true }),
      fulfilled({ ok: true }),
      rejected(new Error('boom')),
      fulfilled({ ok: true }),
    ])
    expect(results[2].ok).toBe(false)
    expect(results[2].category).toBe('site_architecture')
    expect(results[2].error).toBeTruthy()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('every category fails independently — total failure is still reported per-category, not collapsed into one opaque error', () => {
    const results = summarizeCategoryAnalysisOutcomes(ALL_CATEGORIES, [
      fulfilled({ ok: false, error: 'a' }),
      fulfilled({ ok: false, error: 'b' }),
      fulfilled({ ok: false, error: 'c' }),
      fulfilled({ ok: false, error: 'd' }),
    ])
    expect(results.every((r) => r.ok === false)).toBe(true)
    expect(results.map((r) => r.error)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('preserves category identity/order regardless of which ones fail', () => {
    const results = summarizeCategoryAnalysisOutcomes(ALL_CATEGORIES, [fulfilled({ ok: true }), fulfilled({ ok: true }), fulfilled({ ok: true }), fulfilled({ ok: true })])
    expect(results.map((r) => r.category)).toEqual(ALL_CATEGORIES)
  })
})
