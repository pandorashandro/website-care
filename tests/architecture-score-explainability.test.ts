import { describe, expect, it } from 'vitest'
import { calculateArchitectureHealth, explainArchitectureHealth } from '@/lib/architecture/health'

/**
 * Phase 27 score-calibration audit, Step 9 — proves the backend can
 * deterministically explain a persisted score from already-persisted
 * finding fields (severity/confidence/scope/affected_page_count/
 * occurrence_count) with NO new schema needed.
 */
describe('explainArchitectureHealth', () => {
  it('produces the same final score as calculateArchitectureHealth for identical input', () => {
    const findings = [
      { checkKey: 'internal_link_to_broken_edge', severity: 'high' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 2, occurrenceCount: 3 },
      { checkKey: 'deep_page', severity: 'medium' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 1, occurrenceCount: 1 },
    ]
    const health = calculateArchitectureHealth(findings, 20)
    const explanation = explainArchitectureHealth(findings, 20)
    expect(explanation.score).toBe(health.score)
  })

  it('reports one deduction entry per finding, each attributable to its own check_key', () => {
    const findings = [
      { checkKey: 'orphan_page', severity: 'medium' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 3, occurrenceCount: 3 },
      { checkKey: 'internal_link_to_broken_edge', severity: 'high' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 1, occurrenceCount: 5 },
    ]
    const explanation = explainArchitectureHealth(findings, 20)
    expect(explanation.deductions).toHaveLength(2)
    expect(explanation.deductions.map((d) => d.checkKey).sort()).toEqual(['internal_link_to_broken_edge', 'orphan_page'])
  })

  it('the reported spread reflects the occurrence-aware max(pageFraction, occurrenceFraction) — not just page fraction', () => {
    // 1 affected page but 15 occurrences on a 20-page site: occurrence
    // fraction (15/20 = 75%) should dominate and produce the 1.5x ceiling.
    const findings = [{ checkKey: 'internal_link_to_broken_edge', severity: 'high' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 1, occurrenceCount: 15 }]
    const explanation = explainArchitectureHealth(findings, 20)
    expect(explanation.deductions[0].spread).toBe(1.5)
  })

  it('site-scoped findings always report spread 1, regardless of any occurrence/page counts', () => {
    const findings = [{ checkKey: 'widespread_isolated_pages', severity: 'critical' as const, confidence: 'medium' as const, scope: 'site' as const, affectedPageCount: 0, occurrenceCount: 0 }]
    const explanation = explainArchitectureHealth(findings, 20)
    expect(explanation.deductions[0].spread).toBe(1)
  })

  it('startingScore is always 100 and totalDeduction plus score accounts for every tier cap applied', () => {
    const findings = Array.from({ length: 10 }, () => ({
      checkKey: 'orphan_page' as const,
      severity: 'low' as const,
      confidence: 'high' as const,
      scope: 'page' as const,
      affectedPageCount: 1,
      occurrenceCount: 1,
    }))
    const explanation = explainArchitectureHealth(findings, 20)
    expect(explanation.startingScore).toBe(100)
    expect(explanation.tierDeductions.low).toBeGreaterThan(explanation.tierCaps.low) // uncapped raw sum exceeds the cap...
    expect(explanation.score).toBe(100 - Math.min(explanation.tierDeductions.low, explanation.tierCaps.low)) // ...but the score only reflects the CAPPED amount
  })

  it('an empty finding list explains a perfect score with zero deductions', () => {
    const explanation = explainArchitectureHealth([], 20)
    expect(explanation.score).toBe(100)
    expect(explanation.deductions).toEqual([])
    expect(explanation.totalDeduction).toBe(0)
  })
})
