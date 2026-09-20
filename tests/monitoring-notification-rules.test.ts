import { describe, expect, it } from 'vitest'
import {
  evaluateMeaningfulChange,
  selectTopFindingsForEvent,
  MEANINGFUL_HEALTH_DELTA_THRESHOLD,
  MEANINGFUL_PILLAR_DELTA_THRESHOLD,
  MEANINGFUL_UNVERIFIED_COUNT_THRESHOLD,
} from '@/lib/monitoring/notification-rules'
import type { ChangeSummary, FindingChange, PillarScoreDelta } from '@/lib/monitoring/compare'
import type { Severity } from '@/lib/monitoring/types'

function findingChange(overrides: Partial<FindingChange> & Pick<FindingChange, 'state' | 'severity'>): FindingChange {
  return {
    fingerprint: 'on_page_seo:missing_title:https://example.com/a',
    pillar: 'on_page_seo',
    checkKey: 'missing_title',
    title: 'Missing title tag',
    actionability: 'guided_fix',
    severityChange: null,
    ...overrides,
  }
}

function pillarDelta(overrides: Partial<PillarScoreDelta> & { pillar: PillarScoreDelta['pillar'] }): PillarScoreDelta {
  return { previousScore: 80, currentScore: 80, delta: 0, comparability: 'comparable', ...overrides }
}

function summary(overrides: Partial<ChangeSummary> = {}): ChangeSummary {
  return {
    previousCrawlRunId: 'run-1',
    currentCrawlRunId: 'run-2',
    previousCompletedAt: '2026-01-01T00:00:00Z',
    currentCompletedAt: '2026-01-08T00:00:00Z',
    overallHealth: { previousScore: 80, currentScore: 80, delta: 0, comparability: 'not_comparable' },
    pillarDeltas: [],
    findingChanges: [],
    counts: { new: 0, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: 0 },
    ...overrides,
  }
}

const HIGH: Severity = 'high'
const MEDIUM: Severity = 'medium'

describe('evaluateMeaningfulChange', () => {
  it('NEW CRITICAL/HIGH FINDING creates a meaningful event', () => {
    const result = evaluateMeaningfulChange(summary({ findingChanges: [findingChange({ state: 'new', severity: HIGH })] }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('new_high_severity_finding')
  })

  it('a new MEDIUM/LOW finding alone is NOT meaningful — noise control, not a claim it does not matter in-app', () => {
    const result = evaluateMeaningfulChange(summary({ findingChanges: [findingChange({ state: 'new', severity: MEDIUM })] }))
    expect(result.meaningful).toBe(false)
    expect(result.reasons).toEqual([])
  })

  it('WORSENED HIGH-SEVERITY FINDING creates a meaningful event', () => {
    const result = evaluateMeaningfulChange(summary({ findingChanges: [findingChange({ state: 'worsened', severity: HIGH })] }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('worsened_high_severity_finding')
  })

  it('RESOLVED FINDING creates a meaningful (good news) event, regardless of severity', () => {
    const result = evaluateMeaningfulChange(summary({ counts: { new: 0, resolved: 1, persistent: 0, worsened: 0, improved: 0, unverified: 0 } }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('resolved_finding')
  })

  it('IMPROVED FINDING creates a meaningful (good news) event', () => {
    const result = evaluateMeaningfulChange(summary({ counts: { new: 0, resolved: 0, persistent: 0, worsened: 0, improved: 1, unverified: 0 } }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('improved_finding')
  })

  it('PERSISTENT UNCHANGED FINDINGS ALONE DO NOT REPEATEDLY ALERT: a nonzero persistent count with nothing else changing is not meaningful', () => {
    const result = evaluateMeaningfulChange(summary({ counts: { new: 0, resolved: 0, persistent: 5, worsened: 0, improved: 0, unverified: 0 } }))
    expect(result.meaningful).toBe(false)
  })

  it('HEALTH-SCORE MEANINGFUL MOVEMENT: a decline at or beyond the threshold is meaningful', () => {
    const result = evaluateMeaningfulChange(summary({ overallHealth: { previousScore: 80, currentScore: 80 - MEANINGFUL_HEALTH_DELTA_THRESHOLD, delta: -MEANINGFUL_HEALTH_DELTA_THRESHOLD, comparability: 'comparable' } }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('overall_health_declined')
  })

  it('a health movement below the threshold is not meaningful on its own', () => {
    const result = evaluateMeaningfulChange(summary({ overallHealth: { previousScore: 80, currentScore: 78, delta: -2, comparability: 'comparable' } }))
    expect(result.meaningful).toBe(false)
  })

  it('a health improvement at or beyond the threshold is meaningful (good news)', () => {
    const result = evaluateMeaningfulChange(summary({ overallHealth: { previousScore: 70, currentScore: 70 + MEANINGFUL_HEALTH_DELTA_THRESHOLD, delta: MEANINGFUL_HEALTH_DELTA_THRESHOLD, comparability: 'comparable' } }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('overall_health_improved')
  })

  it('NON-COMPARABLE SCORE DOES NOT FABRICATE MOVEMENT: not_comparable is never treated as a real delta even if a stray delta value is present', () => {
    const result = evaluateMeaningfulChange(summary({ overallHealth: { previousScore: null, currentScore: 90, delta: null, comparability: 'not_comparable' } }))
    expect(result.reasons).not.toContain('overall_health_declined')
    expect(result.reasons).not.toContain('overall_health_improved')
  })

  it('PILLAR MOVEMENT: a comparable pillar decline at or beyond its own threshold is meaningful', () => {
    const result = evaluateMeaningfulChange(summary({ pillarDeltas: [pillarDelta({ pillar: 'performance', previousScore: 80, currentScore: 80 - MEANINGFUL_PILLAR_DELTA_THRESHOLD, delta: -MEANINGFUL_PILLAR_DELTA_THRESHOLD })] }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('pillar_score_declined')
  })

  it('a pillar movement below its own threshold is not meaningful', () => {
    const result = evaluateMeaningfulChange(summary({ pillarDeltas: [pillarDelta({ pillar: 'performance', delta: -3 })] }))
    expect(result.meaningful).toBe(false)
  })

  it('a not_comparable pillar delta never contributes to meaningfulness', () => {
    const result = evaluateMeaningfulChange(summary({ pillarDeltas: [pillarDelta({ pillar: 'content', previousScore: null, currentScore: null, delta: null, comparability: 'not_comparable' })] }))
    expect(result.meaningful).toBe(false)
  })

  it('COVERAGE DEGRADATION: unverified count at or beyond the threshold is meaningful even with nothing else changing', () => {
    const result = evaluateMeaningfulChange(summary({ counts: { new: 0, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: MEANINGFUL_UNVERIFIED_COUNT_THRESHOLD } }))
    expect(result.meaningful).toBe(true)
    expect(result.reasons).toContain('coverage_degraded')
  })

  it('an unverified count below the threshold is not meaningful on its own', () => {
    const result = evaluateMeaningfulChange(summary({ counts: { new: 0, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: MEANINGFUL_UNVERIFIED_COUNT_THRESHOLD - 1 } }))
    expect(result.meaningful).toBe(false)
  })

  it('NO NOTIFICATION WHEN NOTHING MEANINGFUL CHANGED: a completely flat comparison produces no reasons at all', () => {
    const result = evaluateMeaningfulChange(summary())
    expect(result).toEqual({ meaningful: false, reasons: [] })
  })
})

describe('selectTopFindingsForEvent', () => {
  it('excludes persistent and unverified findings from the notification content', () => {
    const changes = [findingChange({ state: 'persistent', severity: HIGH }), findingChange({ state: 'unverified', severity: HIGH })]
    expect(selectTopFindingsForEvent(changes)).toEqual([])
  })

  it('sorts eligible findings most-severe-first', () => {
    const changes = [findingChange({ state: 'new', severity: 'low', title: 'Low one' }), findingChange({ state: 'new', severity: 'critical', title: 'Critical one' })]
    const result = selectTopFindingsForEvent(changes)
    expect(result[0].title).toBe('Critical one')
    expect(result[1].title).toBe('Low one')
  })

  it('caps the result at the given limit', () => {
    const changes = Array.from({ length: 10 }, (_, i) => findingChange({ state: 'new', severity: HIGH, title: `Finding ${i}` }))
    expect(selectTopFindingsForEvent(changes, 3)).toHaveLength(3)
  })
})
