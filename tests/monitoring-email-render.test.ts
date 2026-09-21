import { describe, expect, it } from 'vitest'
import { renderMonitoringEmail, type RenderableMonitoringEvent } from '@/lib/monitoring/email/render'

function baseEvent(overrides: Partial<RenderableMonitoringEvent> = {}): RenderableMonitoringEvent {
  return {
    websiteId: 'website-123',
    websiteName: 'example.com',
    eventType: 'meaningful_change',
    reasons: [],
    overallHealthPrevious: null,
    overallHealthCurrent: null,
    overallHealthDelta: null,
    newCount: 0,
    resolvedCount: 0,
    worsenedCount: 0,
    improvedCount: 0,
    topFindings: [],
    failureReason: null,
    appBaseUrl: 'https://app.webioom.com',
    ...overrides,
  }
}

const FORBIDDEN_PHRASES = ['traffic', 'ranking', 'rankings', 'search engine result', 'serp']

describe('renderMonitoringEmail — subject selection', () => {
  it('NEEDS ATTENTION: new findings produce the shared classifyNotification "needs attention" headline', () => {
    const { subject } = renderMonitoringEmail(baseEvent({ newCount: 2 }))
    expect(subject).toBe('Your website needs attention — example.com')
  })

  it('WORSENED findings alone also produce the needs-attention subject', () => {
    const { subject } = renderMonitoringEmail(baseEvent({ worsenedCount: 1 }))
    expect(subject).toContain('needs attention')
  })

  it('GOOD NEWS ONLY: resolved/improved with nothing new/worsened produces the good-news subject', () => {
    const { subject } = renderMonitoringEmail(baseEvent({ resolvedCount: 3 }))
    expect(subject).toBe('Good news — your website improved — example.com')
  })

  it('neither good nor bad (e.g. pure health/pillar movement) falls back to the neutral subject', () => {
    const { subject } = renderMonitoringEmail(baseEvent({ overallHealthCurrent: 70, overallHealthPrevious: 82, overallHealthDelta: -12 }))
    expect(subject).toBe('webioom has an update on your website — example.com')
  })

  it('MONITORING FAILURE gets its own distinct subject, never confused with a change subject', () => {
    const { subject } = renderMonitoringEmail(baseEvent({ eventType: 'monitoring_scan_failed', failureReason: 'The crawl could not reach the site.' }))
    expect(subject).toBe("webioom couldn't complete a scheduled scan of example.com")
  })
})

describe('renderMonitoringEmail — body content', () => {
  it('shows previous -> current health with a signed delta when comparable', () => {
    const { text } = renderMonitoringEmail(baseEvent({ overallHealthPrevious: 81, overallHealthCurrent: 86, overallHealthDelta: 5 }))
    expect(text).toContain('Overall Website Health: 81 → 86 (+5)')
  })

  it('shows only the current score when no previous score is comparable', () => {
    const { text } = renderMonitoringEmail(baseEvent({ overallHealthCurrent: 90 }))
    expect(text).toContain('Overall Website Health: 90')
    expect(text).not.toContain('→')
  })

  it('lists top findings with severity and state', () => {
    const { text } = renderMonitoringEmail(baseEvent({ topFindings: [{ title: 'Missing title tag', severity: 'high', state: 'new' }] }))
    expect(text).toContain('[high] Missing title tag (new)')
  })

  it('includes the failure reason for a monitoring_scan_failed event', () => {
    const { text } = renderMonitoringEmail(baseEvent({ eventType: 'monitoring_scan_failed', failureReason: 'Timed out reaching the website.' }))
    expect(text).toContain('Timed out reaching the website.')
  })

  it('NEVER CLAIMS TRAFFIC/RANKING IMPACT OR UNSUPPORTED CAUSALITY, in any event shape', () => {
    const events = [
      baseEvent({ newCount: 3, worsenedCount: 1, topFindings: [{ title: 'Broken link', severity: 'critical', state: 'new' }] }),
      baseEvent({ resolvedCount: 2, improvedCount: 1 }),
      baseEvent({ overallHealthPrevious: 90, overallHealthCurrent: 60, overallHealthDelta: -30 }),
      baseEvent({ eventType: 'monitoring_scan_failed', failureReason: 'DNS resolution failed.' }),
    ]

    for (const event of events) {
      const { subject, text } = renderMonitoringEmail(event)
      const combined = `${subject}\n${text}`.toLowerCase()
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(combined).not.toContain(phrase)
      }
    }
  })
})

describe('renderMonitoringEmail — link safety', () => {
  it('LINKS USE THE CALLER-SUPPLIED, SERVER-CONTROLLED appBaseUrl VERBATIM — render.ts never fabricates or substitutes a different host', () => {
    const { text } = renderMonitoringEmail(baseEvent({ appBaseUrl: 'https://app.webioom.com' }))
    expect(text).toContain('https://app.webioom.com/dashboard/websites/website-123')
  })

  it('strips a trailing slash on the base URL so the link never contains a double slash', () => {
    const { text } = renderMonitoringEmail(baseEvent({ appBaseUrl: 'https://app.webioom.com/' }))
    expect(text).toContain('https://app.webioom.com/dashboard/websites/website-123')
    expect(text).not.toContain('.com//dashboard')
  })

  it('the link always points at THIS event\'s own websiteId — never a different one', () => {
    const { text } = renderMonitoringEmail(baseEvent({ websiteId: 'a-different-id-456' }))
    expect(text).toContain('/dashboard/websites/a-different-id-456')
  })
})

describe('renderMonitoringEmail — untrusted input handling', () => {
  it('NO EMAIL/HEADER INJECTION: a customer-supplied website name containing CR/LF can never start a new line in the subject or body', () => {
    // render.ts deliberately shows the website name inline in the body so the
    // customer knows which site an email concerns — so injected text (like
    // the literal string "Bcc:") may still appear as harmless inline
    // display text. The actual invariant sanitizeForEmail defends is that
    // the injected CR/LF is stripped so that text can never start its OWN
    // line, which is what would matter if this string were ever fed into a
    // raw header-construction path in the future.
    const { subject, text } = renderMonitoringEmail(baseEvent({ websiteName: 'evil\r\nBcc: attacker@example.com', newCount: 1 }))
    expect(subject).not.toMatch(/[\r\n]/)
    expect(text).not.toMatch(/[\r\n]Bcc:/)
  })

  it('HTML-ESCAPES the customer-supplied website name so it cannot inject markup into the branded template', () => {
    const { html } = renderMonitoringEmail(baseEvent({ websiteName: '<img src=x onerror=alert(1)>', newCount: 1 }))
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('renderMonitoringEmail — premium branded HTML alternative', () => {
  it('produces a table-based, inline-styled HTML document alongside the plain-text fallback', () => {
    const { html, text } = renderMonitoringEmail(baseEvent({ newCount: 1 }))
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<table')
    expect(text.length).toBeGreaterThan(0)
  })

  it('uses the dark-surface logo asset and includes an accessible alt text fallback', () => {
    const { html } = renderMonitoringEmail(baseEvent({ appBaseUrl: 'https://app.webioom.com' }))
    expect(html).toContain('https://app.webioom.com/brand/webioom-logo-on-dark.png')
    expect(html).toContain('alt="webioom"')
  })

  it('gives Outlook (no CSS gradient support) an honest solid dark background-color fallback alongside the gradient', () => {
    const { html } = renderMonitoringEmail(baseEvent({}))
    expect(html).toContain('bgcolor="#12141c"')
    expect(html).toContain('background-color:#12141c')
  })

  it('routes the CTA to this event\'s own website overview — never a generic dashboard link', () => {
    const { html } = renderMonitoringEmail(baseEvent({ websiteId: 'website-999' }))
    expect(html).toContain('href="https://app.webioom.com/dashboard/websites/website-999"')
  })

  it('renders a distinct accent color per communication severity (attention vs. positive)', () => {
    const attention = renderMonitoringEmail(baseEvent({ newCount: 1 }))
    const positive = renderMonitoringEmail(baseEvent({ resolvedCount: 1 }))
    expect(attention.html).toContain('#d97706')
    expect(positive.html).toContain('#16a34a')
  })
})
