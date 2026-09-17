import { describe, expect, it } from 'vitest'
import { buildOnPageCategorySummary } from '@/app/dashboard/websites/[id]/on-page-summary'

/**
 * Phase 28 — mirrors tests/architecture-category-summary.test.ts exactly.
 * buildOnPageCategorySummary is the pure (no I/O) decision logic behind
 * Overview's Category Health "On-Page SEO" tile. Proves, without needing a
 * live Supabase or a rendered component:
 *
 * - Overview's On-Page SEO source and the dedicated page's source are the
 *   exact same shape (score/findingsCount/analyzedAt/analyzerVersion are
 *   pass-through fields from the same crawl_analyses row, never
 *   recalculated).
 * - Overview performs no On-Page SEO scoring logic.
 * - No legacy-score fallback is even structurally possible — the function's
 *   signature has no parameter through which any unrelated category score
 *   could be supplied.
 */
describe('buildOnPageCategorySummary (Phase 28)', () => {
  it('reports not_analyzed when no crawl_run exists at all', () => {
    const summary = buildOnPageCategorySummary(null, null)
    expect(summary).toEqual({
      categoryKey: 'on_page_seo',
      status: 'not_analyzed',
      score: null,
      findingsCount: null,
      partial: false,
      analyzedAt: null,
      analyzerVersion: null,
    })
  })

  it('reports not_analyzed when the latest crawl_run is still queued or running', () => {
    for (const status of ['queued', 'running']) {
      expect(buildOnPageCategorySummary({ id: 'run-1', status }, null).status).toBe('not_analyzed')
    }
  })

  it('reports not_analyzed when the crawl completed but no crawl_analyses row exists yet', () => {
    expect(buildOnPageCategorySummary({ id: 'run-1', status: 'completed' }, null).status).toBe('not_analyzed')
  })

  it('reports not_analyzed when an analysis row exists but its health_score is null', () => {
    const summary = buildOnPageCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: null, findings_count: 0, completed_at: '2026-01-01T00:00:00Z', analyzer_version: 'on-page-v1' }
    )
    expect(summary.status).toBe('not_analyzed')
  })

  it('never falls back to any legacy or unrelated-category score — the function has no parameter through which one could even be supplied', () => {
    expect(buildOnPageCategorySummary.length).toBe(2)
  })

  it('passes through score, findings count, timestamp, and analyzer version verbatim when analyzed — no recomputation', () => {
    const summary = buildOnPageCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 88, findings_count: 2, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'on-page-v1' }
    )
    expect(summary).toEqual({
      categoryKey: 'on_page_seo',
      status: 'analyzed',
      score: 88,
      findingsCount: 2,
      partial: false,
      analyzedAt: '2026-02-01T12:00:00Z',
      analyzerVersion: 'on-page-v1',
    })
  })

  it('marks partial when the crawl_run status is partial', () => {
    const summary = buildOnPageCategorySummary(
      { id: 'run-1', status: 'partial' },
      { health_score: 70, findings_count: 3, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'on-page-v1' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.partial).toBe(true)
  })

  it('a score of exactly 0 is still "analyzed", never misread as "not analyzed"', () => {
    const summary = buildOnPageCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 0, findings_count: 12, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'on-page-v1' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.score).toBe(0)
  })

  it('a findings count of exactly 0 is still "analyzed" (a clean site)', () => {
    const summary = buildOnPageCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 100, findings_count: 0, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'on-page-v1' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.findingsCount).toBe(0)
  })
})
