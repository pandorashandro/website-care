/**
 * Sprint 2, Prompt 2 — STEP 10. Pure email content builder — no I/O, fully
 * unit-testable. Every fact below comes verbatim from an already-persisted
 * monitoring_events row (itself built entirely from Sprint 2 Prompt 1's
 * deterministic ChangeSummary) — this function invents nothing and never
 * makes a claim the underlying comparison doesn't already support. In
 * particular, it never says anything about traffic, rankings, or Google
 * Search Console data, since none of that evidence exists yet.
 */

export type RenderableFinding = { title: string; severity: string; state: string }

export type RenderableMonitoringEvent = {
  websiteId: string
  websiteName: string
  eventType: 'meaningful_change' | 'monitoring_scan_failed'
  overallHealthPrevious: number | null
  overallHealthCurrent: number | null
  overallHealthDelta: number | null
  newCount: number
  resolvedCount: number
  worsenedCount: number
  improvedCount: number
  topFindings: RenderableFinding[]
  failureReason: string | null
  appBaseUrl: string
}

export type RenderedEmail = { subject: string; text: string }

function overviewUrl(event: RenderableMonitoringEvent): string {
  const base = event.appBaseUrl.replace(/\/$/, '')
  return `${base}/dashboard/websites/${event.websiteId}`
}

/**
 * Sprint 2, Prompt 3 security review: `websiteName` is customer-supplied
 * free text (set when the website was added — see app/dashboard/actions.ts's
 * addWebsite), the ONE piece of untrusted input this renderer touches.
 * Every other value here is either server-computed (scores/counts/deltas)
 * or a fixed, developer-authored finding title from a canonical check
 * definition. Stripping control characters (CR/LF in particular) is
 * defense-in-depth against header-injection-style abuse even though the
 * current transport (a single JSON field in an HTTPS API call — see
 * resend-provider.ts) does not construct raw SMTP headers from this value
 * itself.
 */
function sanitizeForEmail(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function renderFailureEmail(event: RenderableMonitoringEvent): RenderedEmail {
  const lines = [`webioom attempted a scheduled monitoring scan of ${event.websiteName}, but it did not complete.`]
  if (event.failureReason) lines.push(`Reason: ${event.failureReason}`)
  lines.push('', 'webioom will automatically try again on its normal schedule.', '', `View this website: ${overviewUrl(event)}`)

  return { subject: `webioom couldn't complete a scheduled scan of ${event.websiteName}`, text: lines.join('\n') }
}

function renderChangeEmail(event: RenderableMonitoringEvent): RenderedEmail {
  const hasNewOrWorsened = event.newCount > 0 || event.worsenedCount > 0
  const hasOnlyGoodNews = !hasNewOrWorsened && (event.resolvedCount > 0 || event.improvedCount > 0)

  const subject = hasNewOrWorsened
    ? `webioom found changes that need your attention on ${event.websiteName}`
    : hasOnlyGoodNews
      ? `Good news — webioom verified improvements on ${event.websiteName}`
      : `Your website health changed on ${event.websiteName}`

  const lines: string[] = []

  if (event.overallHealthCurrent !== null) {
    const delta = event.overallHealthDelta
    const deltaLabel = delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta})` : ''
    lines.push(
      event.overallHealthPrevious !== null
        ? `Overall Website Health: ${event.overallHealthPrevious} → ${event.overallHealthCurrent}${deltaLabel}`
        : `Overall Website Health: ${event.overallHealthCurrent}`
    )
  }

  if (event.newCount > 0) lines.push(`${event.newCount} new issue${event.newCount === 1 ? '' : 's'}`)
  if (event.worsenedCount > 0) lines.push(`${event.worsenedCount} issue${event.worsenedCount === 1 ? '' : 's'} got worse`)
  if (event.resolvedCount > 0) lines.push(`${event.resolvedCount} issue${event.resolvedCount === 1 ? '' : 's'} resolved`)
  if (event.improvedCount > 0) lines.push(`${event.improvedCount} issue${event.improvedCount === 1 ? '' : 's'} improved`)

  if (event.topFindings.length > 0) {
    lines.push('', 'What changed:')
    for (const finding of event.topFindings) {
      lines.push(`- [${finding.severity}] ${finding.title} (${finding.state})`)
    }
  }

  lines.push('', `See the full details: ${overviewUrl(event)}`)

  return { subject, text: lines.join('\n') }
}

export function renderMonitoringEmail(rawEvent: RenderableMonitoringEvent): RenderedEmail {
  const event: RenderableMonitoringEvent = { ...rawEvent, websiteName: sanitizeForEmail(rawEvent.websiteName) }
  return event.eventType === 'monitoring_scan_failed' ? renderFailureEmail(event) : renderChangeEmail(event)
}
