/**
 * Unified webioom engine — pure orchestration logic shared by
 * scan-actions.ts, kept in its OWN plain module (not a `'use server'` file)
 * specifically because Next.js requires every top-level export of a
 * `'use server'` file to be an async function — this mapping is
 * synchronous and needs to be directly unit-testable (see
 * tests/scan-actions.test.ts) without any server-action machinery.
 */

export type CanonicalCategoryKey = 'technical_seo' | 'on_page_seo' | 'site_architecture' | 'content' | 'performance' | 'accessibility' | 'security'
export type CategoryAnalysisOutcome = { category: CanonicalCategoryKey; ok: boolean; error?: string }

/**
 * Pure mapping from `Promise.allSettled`'s raw settlement results to the
 * honest per-category outcome list — one analyzer's failure (an `{ok:
 * false}` result OR a thrown exception) is represented individually and
 * never affects the other categories' own successful results.
 */
export function summarizeCategoryAnalysisOutcomes(
  categories: CanonicalCategoryKey[],
  settled: PromiseSettledResult<{ ok: boolean; error?: string }>[]
): CategoryAnalysisOutcome[] {
  return settled.map((outcome, index) => {
    const category = categories[index]
    if (outcome.status === 'fulfilled') {
      return outcome.value.ok ? { category, ok: true } : { category, ok: false, error: outcome.value.error }
    }
    // A thrown exception (as opposed to an { ok: false } result the
    // analyzer itself returned) is still represented honestly rather than
    // silently swallowed — mirrors the crawler persistence layer's own
    // "never let a failure look silently successful" hardening.
    console.error(`[unified-scan] ${category} analysis threw:`, outcome.reason)
    return { category, ok: false, error: 'Unexpected error during analysis.' }
  })
}
