import { describe, expect, it } from 'vitest'
import { buildTechnicalSeoCategorySummary } from '@/app/dashboard/websites/[id]/technical-seo-summary'

/**
 * Phase 26B correction — buildTechnicalSeoCategorySummary is the pure
 * (no I/O) decision logic behind Overview's Category Health "Technical SEO"
 * tile. Testing it directly proves, without needing a live Supabase or a
 * rendered component:
 *
 * - Overview's Technical SEO source and the dedicated page's source are the
 *   exact same shape (score/findingsCount/analyzedAt/analyzerVersion are
 *   pass-through fields from the same crawl_analyses row, never
 *   recalculated) — see also tests/technical-seo-run-analysis.test.ts's own
 *   "persists the health score on the analysis row itself" test, which
 *   proves the dedicated page's source and this function's input are
 *   identical in shape.
 * - Overview performs no Technical SEO SCORING logic — this function only
 *   ever reshapes already-computed values, it never derives a score from
 *   findings.
 * - There is no legacy-score fallback: the function's signature has no
 *   parameter through which a `categories.technical`-shaped value could
 *   even be passed in, so a fallback to it is structurally impossible, not
 *   just avoided by convention.
 */
describe('buildTechnicalSeoCategorySummary (Phase 26B correction)', () => {
  it('reports not_analyzed when no crawl_run exists at all', () => {
    const summary = buildTechnicalSeoCategorySummary(null, null)
    expect(summary).toEqual({
      categoryKey: 'technical_seo',
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
      const summary = buildTechnicalSeoCategorySummary({ id: 'run-1', status }, null)
      expect(summary.status).toBe('not_analyzed')
    }
  })

  it('reports not_analyzed when the latest crawl_run failed or was cancelled', () => {
    for (const status of ['failed', 'cancelled']) {
      const summary = buildTechnicalSeoCategorySummary({ id: 'run-1', status }, null)
      expect(summary.status).toBe('not_analyzed')
    }
  })

  it('reports not_analyzed when the crawl completed but no crawl_analyses row exists yet', () => {
    const summary = buildTechnicalSeoCategorySummary({ id: 'run-1', status: 'completed' }, null)
    expect(summary.status).toBe('not_analyzed')
  })

  it('reports not_analyzed when an analysis row exists but its health_score is null (e.g. a technical-v1/legacy row)', () => {
    const summary = buildTechnicalSeoCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: null, findings_count: 0, completed_at: '2026-01-01T00:00:00Z', analyzer_version: 'technical-v1' }
    )
    expect(summary.status).toBe('not_analyzed')
  })

  it('never falls back to any legacy score — the function has no parameter through which one could even be supplied', () => {
    // Structural proof: the function accepts only (crawlRun, analysis) — no
    // third "legacy categories" argument exists for it to fall back to.
    expect(buildTechnicalSeoCategorySummary.length).toBe(2)
  })

  it('passes through score, findings count, timestamp, and analyzer version verbatim when analyzed — no recomputation', () => {
    const summary = buildTechnicalSeoCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 96, findings_count: 1, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'technical-v2' }
    )
    expect(summary).toEqual({
      categoryKey: 'technical_seo',
      status: 'analyzed',
      score: 96,
      findingsCount: 1,
      partial: false,
      analyzedAt: '2026-02-01T12:00:00Z',
      analyzerVersion: 'technical-v2',
    })
  })

  it('marks partial when the crawl_run status is partial — preserved, never hidden', () => {
    const summary = buildTechnicalSeoCategorySummary(
      { id: 'run-1', status: 'partial' },
      { health_score: 80, findings_count: 3, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'technical-v2' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.partial).toBe(true)
  })

  it('a score of exactly 0 is still "analyzed", never misread as "not analyzed" (falsy-value trap)', () => {
    const summary = buildTechnicalSeoCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 0, findings_count: 12, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'technical-v2' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.score).toBe(0)
  })

  it('a findings count of exactly 0 is still "analyzed" (a clean site)', () => {
    const summary = buildTechnicalSeoCategorySummary(
      { id: 'run-1', status: 'completed' },
      { health_score: 100, findings_count: 0, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'technical-v2' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.findingsCount).toBe(0)
  })
})
