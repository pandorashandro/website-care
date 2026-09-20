import { describe, expect, it } from 'vitest'
import { buildContentCategorySummary } from '@/app/dashboard/websites/[id]/content-summary'

/**
 * Phase 29 — mirrors tests/on-page-category-summary.test.ts exactly.
 */
describe('buildContentCategorySummary (Phase 29)', () => {
  it('reports not_analyzed when no crawl_run exists at all', () => {
    const summary = buildContentCategorySummary(null, null)
    expect(summary).toEqual({
      categoryKey: 'content',
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
      expect(buildContentCategorySummary({ id: 'run-1', status }, null).status).toBe('not_analyzed')
    }
  })

  it('reports not_analyzed when the crawl completed but no crawl_analyses row exists yet', () => {
    expect(buildContentCategorySummary({ id: 'run-1', status: 'completed' }, null).status).toBe('not_analyzed')
  })

  it('reports not_analyzed when an analysis row exists but its health_score is null', () => {
    const summary = buildContentCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: null, findings_count: 0, completed_at: '2026-01-01T00:00:00Z', analyzer_version: 'content-v2' }
    )
    expect(summary.status).toBe('not_analyzed')
  })

  it('never falls back to any legacy or unrelated-category score', () => {
    expect(buildContentCategorySummary.length).toBe(2)
  })

  it('passes through score, findings count, timestamp, and analyzer version verbatim when analyzed', () => {
    const summary = buildContentCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 88, findings_count: 2, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'content-v2' }
    )
    expect(summary).toEqual({
      categoryKey: 'content',
      status: 'analyzed',
      score: 88,
      findingsCount: 2,
      partial: false,
      analyzedAt: '2026-02-01T12:00:00Z',
      analyzerVersion: 'content-v2',
    })
  })

  it('marks partial when the crawl_run status is partial', () => {
    const summary = buildContentCategorySummary(
      { id: 'run-1', status: 'partial' },
      { health_score: 70, findings_count: 3, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'content-v2' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.partial).toBe(true)
  })

  it('a score of exactly 0 is still "analyzed"', () => {
    const summary = buildContentCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 0, findings_count: 12, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'content-v2' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.score).toBe(0)
  })

  it('a findings count of exactly 0 is still "analyzed" (a clean site)', () => {
    const summary = buildContentCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 100, findings_count: 0, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'content-v2' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.findingsCount).toBe(0)
  })
})
