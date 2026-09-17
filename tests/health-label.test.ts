import { describe, expect, it } from 'vitest'
import { healthLabel, healthTone, needsAttention } from '@/lib/scanner/health-label'

/**
 * Phase 27 score-calibration audit, Step 8/12 — `healthLabel` is shared
 * across every category tile (Technical SEO, Site Architecture, and the
 * legacy categories) with no prior dedicated test. Added here as part of
 * verifying Site Architecture's score presentation is well-defined at
 * every boundary, without changing the shared thresholds themselves (no
 * evidence was found to justify changing them for this phase).
 */
describe('healthLabel boundaries', () => {
  it('scores 90 and above are Excellent', () => {
    expect(healthLabel(90)).toBe('Excellent')
    expect(healthLabel(100)).toBe('Excellent')
  })

  it('scores just under 90 are Good, not Excellent', () => {
    expect(healthLabel(89)).toBe('Good')
  })

  it('scores 75-89 are Good', () => {
    expect(healthLabel(75)).toBe('Good')
    expect(healthLabel(89)).toBe('Good')
  })

  it('scores just under 75 are Needs Attention, not Good', () => {
    expect(healthLabel(74)).toBe('Needs Attention')
  })

  it('scores 50-74 are Needs Attention', () => {
    expect(healthLabel(50)).toBe('Needs Attention')
    expect(healthLabel(74)).toBe('Needs Attention')
  })

  it('scores below 50 are Poor', () => {
    expect(healthLabel(49)).toBe('Poor')
    expect(healthLabel(0)).toBe('Poor')
  })

  it('needsAttention uses the exact same 75 boundary as healthLabel', () => {
    expect(needsAttention(75)).toBe(false)
    expect(needsAttention(74)).toBe(true)
  })

  it('healthTone treats Excellent and Good as the same positive tone, distinct from Needs Attention/Poor', () => {
    expect(healthTone(95)).toBe('success')
    expect(healthTone(80)).toBe('success')
    expect(healthTone(60)).toBe('warning')
    expect(healthTone(20)).toBe('danger')
  })
})
