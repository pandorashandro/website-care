import type { MeaningfulChangeReason } from './notification-rules'

/**
 * Sprint 3 (monitoring + notifications completion) — the ONE place a raw
 * monitoring_events row is translated into customer-facing language and a
 * communication severity. Both the in-app notification bell/panel/center
 * AND the branded email template call this same function so the SAME
 * event always produces the SAME meaning everywhere it appears (Section
 * 30 of this sprint's own brief: "the language does not need to be
 * identical, the meaning must be consistent"). No internal event/reason
 * name (`new_high_severity_finding`, `meaningful_change`) is ever rendered
 * to a customer directly — every one is mapped to plain language here,
 * once.
 */

export type CommunicationSeverity = 'informational' | 'positive' | 'attention' | 'important'

export type NotificationEventInput = {
  eventType: 'meaningful_change' | 'monitoring_scan_failed'
  reasons: MeaningfulChangeReason[]
  overallHealthPrevious: number | null
  overallHealthCurrent: number | null
  overallHealthDelta: number | null
  newCount: number
  resolvedCount: number
  worsenedCount: number
  improvedCount: number
  failureReason: string | null
}

export type ClassifiedNotification = {
  severity: CommunicationSeverity
  /** Short, scannable — the bell panel / email subject line. */
  headline: string
  /** One sentence of plain-language context beneath the headline. */
  summary: string
  /** Ordered, customer-facing highlight lines (e.g. "2 new high-priority issues") — never raw reason codes. */
  highlights: string[]
}

const REASON_COPY: Partial<Record<MeaningfulChangeReason, string>> = {
  new_high_severity_finding: 'New high-priority issues found',
  worsened_high_severity_finding: 'An existing issue got worse',
  overall_health_declined: 'Overall Website Health dropped',
  overall_health_improved: 'Overall Website Health improved',
  pillar_score_declined: 'A pillar score dropped notably',
  pillar_score_improved: 'A pillar score improved notably',
  coverage_degraded: "webioom couldn't confirm some previous findings this time",
}

function countLine(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * `meaningful_change` events already passed evaluateMeaningfulChange's own
 * "is this worth telling the customer" threshold (see notification-rules.ts)
 * before a monitoring_events row was ever created for them — so this
 * function only ever has to decide POSITIVE vs ATTENTION vs the rare
 * neutral INFORMATIONAL case (coverage degraded, nothing else), never
 * "should this be silent," which already happened upstream.
 */
export function classifyNotification(event: NotificationEventInput): ClassifiedNotification {
  if (event.eventType === 'monitoring_scan_failed') {
    return {
      severity: 'important',
      headline: "webioom couldn't complete a scheduled check",
      summary: event.failureReason
        ? `webioom will automatically try again on its normal schedule. ${event.failureReason}`
        : 'webioom will automatically try again on its normal schedule.',
      highlights: [],
    }
  }

  const hasNewOrWorsened = event.newCount > 0 || event.worsenedCount > 0
  const hasGoodNews = event.resolvedCount > 0 || event.improvedCount > 0
  const onlyCoverageDegraded = event.reasons.length === 1 && event.reasons[0] === 'coverage_degraded'

  const highlights: string[] = []
  if (event.overallHealthCurrent !== null) {
    const delta = event.overallHealthDelta
    highlights.push(
      event.overallHealthPrevious !== null
        ? `Overall Website Health: ${event.overallHealthPrevious} → ${event.overallHealthCurrent}${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta})` : ''}`
        : `Overall Website Health: ${event.overallHealthCurrent}`
    )
  }
  const newLine = countLine(event.newCount, 'new high-priority issue', 'new high-priority issues')
  const worsenedLine = countLine(event.worsenedCount, 'issue got worse', 'issues got worse')
  const resolvedLine = countLine(event.resolvedCount, 'issue resolved', 'issues resolved')
  const improvedLine = countLine(event.improvedCount, 'issue improved', 'issues improved')
  for (const line of [newLine, worsenedLine, resolvedLine, improvedLine]) {
    if (line) highlights.push(line)
  }

  if (onlyCoverageDegraded) {
    return {
      severity: 'informational',
      headline: 'webioom has an update on your website',
      summary: REASON_COPY.coverage_degraded ?? 'Some previous findings could not be reconfirmed this check.',
      highlights,
    }
  }

  if (hasNewOrWorsened) {
    return {
      severity: 'attention',
      headline: 'Your website needs attention',
      summary: 'webioom found changes worth reviewing on your latest scheduled check.',
      highlights,
    }
  }

  if (hasGoodNews) {
    return {
      severity: 'positive',
      headline: 'Good news — your website improved',
      summary: 'webioom confirmed real improvements on your latest scheduled check.',
      highlights,
    }
  }

  return {
    severity: 'informational',
    headline: 'webioom has an update on your website',
    summary: 'Something changed on your latest scheduled check.',
    highlights,
  }
}

/**
 * Sprint 3 (monitoring + notifications completion) — Section 19's email
 * decision engine: "not every notification becomes an email... routine
 * informational updates stay in-app only." `evaluateMeaningfulChange`
 * (notification-rules.ts) already decided this event clears the bar for a
 * persisted, in-app notification at all — this is the SECOND, narrower
 * gate deciding whether that same event also clears the bar for an email,
 * so a customer with email alerts on is never emailed about something as
 * routine as "webioom couldn't reconfirm a few previous findings this
 * check" (the one case classifyNotification calls merely
 * 'informational' even though it passed the meaningful-change threshold).
 * MONITORING FAILED events are always 'important' and therefore always
 * pass this gate, matching this sprint's own "monitoring failure requiring
 * action" email-eligible example.
 */
export function shouldEmailForSeverity(severity: CommunicationSeverity): boolean {
  return severity !== 'informational'
}
