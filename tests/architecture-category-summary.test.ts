import { describe, expect, it } from 'vitest'
import { buildSiteArchitectureCategorySummary } from '@/app/dashboard/websites/[id]/site-architecture-summary'

/**
 * Phase 27 — mirrors tests/technical-seo-category-summary.test.ts exactly.
 * buildSiteArchitectureCategorySummary is the pure (no I/O) decision logic
 * behind Overview's Category Health "Site Architecture" tile. Proves,
 * without needing a live Supabase or a rendered component:
 *
 * - Overview's Site Architecture source and the dedicated page's source
 *   are the exact same shape (score/findingsCount/analyzedAt/
 *   analyzerVersion are pass-through fields from the same crawl_analyses
 *   row, never recalculated).
 * - Overview performs no Site Architecture SCORING logic.
 * - No legacy-score fallback is even structurally possible — the
 *   function's signature has no parameter through which any unrelated
 *   category score could be supplied.
 */
describe('buildSiteArchitectureCategorySummary (Phase 27)', () => {
  it('reports not_analyzed when no crawl_run exists at all', () => {
    const summary = buildSiteArchitectureCategorySummary(null, null)
    expect(summary).toEqual({
      categoryKey: 'site_architecture',
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
      const summary = buildSiteArchitectureCategorySummary({ id: 'run-1', status }, null)
      expect(summary.status).toBe('not_analyzed')
    }
  })

  it('reports not_analyzed when the latest crawl_run failed or was cancelled', () => {
    for (const status of ['failed', 'cancelled']) {
      const summary = buildSiteArchitectureCategorySummary({ id: 'run-1', status }, null)
      expect(summary.status).toBe('not_analyzed')
    }
  })

  it('reports not_analyzed when the crawl completed but no crawl_analyses row exists yet', () => {
    const summary = buildSiteArchitectureCategorySummary({ id: 'run-1', status: 'completed' }, null)
    expect(summary.status).toBe('not_analyzed')
  })

  it('reports not_analyzed when an analysis row exists but its health_score is null', () => {
    const summary = buildSiteArchitectureCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: null, findings_count: 0, completed_at: '2026-01-01T00:00:00Z', analyzer_version: 'site-architecture-v3' }
    )
    expect(summary.status).toBe('not_analyzed')
  })

  it('never falls back to any legacy or unrelated-category score — the function has no parameter through which one could even be supplied', () => {
    expect(buildSiteArchitectureCategorySummary.length).toBe(2)
  })

  it('passes through score, findings count, timestamp, and analyzer version verbatim when analyzed — no recomputation', () => {
    const summary = buildSiteArchitectureCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 88, findings_count: 2, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'site-architecture-v3' }
    )
    expect(summary).toEqual({
      categoryKey: 'site_architecture',
      status: 'analyzed',
      score: 88,
      findingsCount: 2,
      partial: false,
      analyzedAt: '2026-02-01T12:00:00Z',
      analyzerVersion: 'site-architecture-v3',
      coverage: null,
    })
  })

  /**
   * Evidence-aware health scoring (2026-09-22): coverage 'none' means ZERO
   * pages were eligible to build a page graph from — see
   * lib/architecture/coverage.ts. The persisted health_score in that case
   * is a hollow, unguarded 100.
   */
  it("REGRESSION — coverage.level 'none' reports not_analyzed, overriding a hollow 100", () => {
    const summary = buildSiteArchitectureCategorySummary(
      { id: 'run-1', status: 'completed' },
      {
        health_score: 100,
        findings_count: 0,
        completed_at: '2026-02-01T12:00:00Z',
        analyzer_version: 'site-architecture-v3',
        coverage: { eligiblePageCount: 0, totalAnalyzedPages: 1, graphChecksAssessed: false, level: 'none' },
      }
    )
    expect(summary.status).toBe('not_analyzed')
    expect(summary.score).toBeNull()
  })

  it("coverage.level 'low' (exactly 1 eligible page) is still 'analyzed' — a thin graph is not the same as no graph", () => {
    const summary = buildSiteArchitectureCategorySummary(
      { id: 'run-1', status: 'completed' },
      {
        health_score: 100,
        findings_count: 0,
        completed_at: '2026-02-01T12:00:00Z',
        analyzer_version: 'site-architecture-v3',
        coverage: { eligiblePageCount: 1, totalAnalyzedPages: 1, graphChecksAssessed: false, level: 'low' },
      }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.coverage).toBe('low')
  })

  it('marks partial when the crawl_run status is partial — preserved, never hidden', () => {
    const summary = buildSiteArchitectureCategorySummary(
      { id: 'run-1', status: 'partial' },
      { health_score: 70, findings_count: 3, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'site-architecture-v3' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.partial).toBe(true)
  })

  it('a score of exactly 0 is still "analyzed", never misread as "not analyzed" (falsy-value trap)', () => {
    const summary = buildSiteArchitectureCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 0, findings_count: 12, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'site-architecture-v3' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.score).toBe(0)
  })

  it('a findings count of exactly 0 is still "analyzed" (a clean architecture)', () => {
    const summary = buildSiteArchitectureCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 100, findings_count: 0, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'site-architecture-v3' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.findingsCount).toBe(0)
  })
})
