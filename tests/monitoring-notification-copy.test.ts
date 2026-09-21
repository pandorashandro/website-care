import { describe, expect, it } from 'vitest'
import { classifyNotification, shouldEmailForSeverity, type NotificationEventInput } from '@/lib/monitoring/notification-copy'

function baseEvent(overrides: Partial<NotificationEventInput> = {}): NotificationEventInput {
  return {
    eventType: 'meaningful_change',
    reasons: [],
    overallHealthPrevious: null,
    overallHealthCurrent: null,
    overallHealthDelta: null,
    newCount: 0,
    resolvedCount: 0,
    worsenedCount: 0,
    improvedCount: 0,
    failureReason: null,
    ...overrides,
  }
}

describe('classifyNotification — severity selection', () => {
  it('MONITORING FAILED is always "important", regardless of any other field', () => {
    const classified = classifyNotification(baseEvent({ eventType: 'monitoring_scan_failed', failureReason: 'The crawl could not reach the site.' }))
    expect(classified.severity).toBe('important')
    expect(classified.summary).toContain('The crawl could not reach the site.')
  })

  it('new or worsened findings are "attention", never "important" (no manufactured panic)', () => {
    const newFinding = classifyNotification(baseEvent({ newCount: 1 }))
    const worsened = classifyNotification(baseEvent({ worsenedCount: 1 }))
    expect(newFinding.severity).toBe('attention')
    expect(worsened.severity).toBe('attention')
  })

  it('resolved or improved findings alone are "positive"', () => {
    const resolved = classifyNotification(baseEvent({ resolvedCount: 2 }))
    const improved = classifyNotification(baseEvent({ improvedCount: 1 }))
    expect(resolved.severity).toBe('positive')
    expect(improved.severity).toBe('positive')
  })

  it('new/worsened findings take priority over simultaneous good news — a mixed run is "attention," never miscategorized as purely positive', () => {
    const classified = classifyNotification(baseEvent({ newCount: 1, resolvedCount: 3 }))
    expect(classified.severity).toBe('attention')
  })

  it('a coverage-degraded-only event is the neutral "informational" severity, never alarming', () => {
    const classified = classifyNotification(baseEvent({ reasons: ['coverage_degraded'] }))
    expect(classified.severity).toBe('informational')
  })

  it('pure health/pillar movement with no new/worsened/resolved/improved counts falls back to neutral "informational"', () => {
    const classified = classifyNotification(baseEvent({ overallHealthPrevious: 82, overallHealthCurrent: 70, overallHealthDelta: -12 }))
    expect(classified.severity).toBe('informational')
  })
})

describe('classifyNotification — highlights never invent unsupported evidence', () => {
  it('includes a health delta line only when a current score exists', () => {
    const withHealth = classifyNotification(baseEvent({ overallHealthPrevious: 81, overallHealthCurrent: 86, overallHealthDelta: 5 }))
    const withoutHealth = classifyNotification(baseEvent({ newCount: 1 }))
    expect(withHealth.highlights.some((line) => line.includes('81 → 86 (+5)'))).toBe(true)
    expect(withoutHealth.highlights.some((line) => line.startsWith('Overall Website Health'))).toBe(false)
  })

  it('never mentions traffic, rankings, or search-engine-result causation in any severity', () => {
    const forbidden = ['traffic', 'ranking', 'rankings', 'search engine result', 'serp']
    const events = [
      baseEvent({ newCount: 3, worsenedCount: 1 }),
      baseEvent({ resolvedCount: 2, improvedCount: 1 }),
      baseEvent({ reasons: ['coverage_degraded'] }),
      baseEvent({ eventType: 'monitoring_scan_failed', failureReason: 'DNS resolution failed.' }),
    ]
    for (const event of events) {
      const classified = classifyNotification(event)
      const combined = `${classified.headline} ${classified.summary} ${classified.highlights.join(' ')}`.toLowerCase()
      for (const phrase of forbidden) {
        expect(combined).not.toContain(phrase)
      }
    }
  })

  it('never exposes an internal reason code or event-type string directly to the customer', () => {
    const classified = classifyNotification(baseEvent({ reasons: ['new_high_severity_finding', 'overall_health_declined'], newCount: 1 }))
    const combined = `${classified.headline} ${classified.summary} ${classified.highlights.join(' ')}`
    expect(combined).not.toContain('new_high_severity_finding')
    expect(combined).not.toContain('overall_health_declined')
    expect(combined).not.toContain('meaningful_change')
  })
})

describe('shouldEmailForSeverity — the email decision engine\'s severity gate', () => {
  it('ROUTINE INFORMATIONAL STAYS IN-APP ONLY: an informational-severity event never clears the email bar', () => {
    expect(shouldEmailForSeverity('informational')).toBe(false)
  })

  it('MEANINGFUL DETERIORATION DOES NOTIFY: attention and important severities always clear the email bar', () => {
    expect(shouldEmailForSeverity('attention')).toBe(true)
    expect(shouldEmailForSeverity('important')).toBe(true)
  })

  it('a meaningful positive/resolved digest also clears the email bar', () => {
    expect(shouldEmailForSeverity('positive')).toBe(true)
  })

  it('a coverage-degraded-only classification (the one real informational case) is the specific scenario this gate exists to stop from emailing', () => {
    const classified = classifyNotification({
      eventType: 'meaningful_change',
      reasons: ['coverage_degraded'],
      overallHealthPrevious: null,
      overallHealthCurrent: null,
      overallHealthDelta: null,
      newCount: 0,
      resolvedCount: 0,
      worsenedCount: 0,
      improvedCount: 0,
      failureReason: null,
    })
    expect(shouldEmailForSeverity(classified.severity)).toBe(false)
  })
})
