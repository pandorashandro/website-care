import { describe, expect, it } from 'vitest'
import { buildPillarCategorySummary } from '@/lib/pillars/summary'

describe('buildPillarCategorySummary — shared across Performance/Accessibility/Security', () => {
  it('reports not_analyzed when no crawl_run exists at all', () => {
    expect(buildPillarCategorySummary('performance', null, null)).toEqual({
      categoryKey: 'performance',
      status: 'not_analyzed',
      score: null,
      findingsCount: null,
      partial: false,
      analyzedAt: null,
      analyzerVersion: null,
    })
  })

  it('reports not_analyzed when the crawl is still queued/running', () => {
    for (const status of ['queued', 'running']) {
      expect(buildPillarCategorySummary('accessibility', { id: 'run-1', status }, null).status).toBe('not_analyzed')
    }
  })

  it('reports not_analyzed when the crawl completed but no analysis row exists yet', () => {
    expect(buildPillarCategorySummary('security', { id: 'run-1', status: 'completed' }, null).status).toBe('not_analyzed')
  })

  it('passes through score/findings/timestamp/version verbatim when analyzed', () => {
    const summary = buildPillarCategorySummary(
      'performance',
      { id: 'run-1', status: 'completed' },
      { health_score: 82, findings_count: 4, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'performance-v1' }
    )
    expect(summary).toEqual({
      categoryKey: 'performance',
      status: 'analyzed',
      score: 82,
      findingsCount: 4,
      partial: false,
      analyzedAt: '2026-02-01T12:00:00Z',
      analyzerVersion: 'performance-v1',
    })
  })

  it('marks partial when the crawl_run status is partial', () => {
    const summary = buildPillarCategorySummary(
      'accessibility',
      { id: 'run-1', status: 'partial' },
      { health_score: 70, findings_count: 2, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'accessibility-v1' }
    )
    expect(summary.partial).toBe(true)
  })

  it('a score of exactly 0 is still "analyzed" — never mistaken for not_analyzed', () => {
    const summary = buildPillarCategorySummary(
      'security',
      { id: 'run-1', status: 'completed' },
      { health_score: 0, findings_count: 9, completed_at: '2026-02-01T12:00:00Z', analyzer_version: 'security-v1' }
    )
    expect(summary.status).toBe('analyzed')
    expect(summary.score).toBe(0)
  })
})
