/**
 * Sprint 3 (monitoring + notifications completion) — pure, timezone-safe
 * relative-time formatting for the notification bell/panel/center. Takes
 * `now` as an explicit parameter (rather than reading `Date.now()`
 * internally) purely so this stays deterministically unit-testable — every
 * real call site simply omits it and gets the actual current time.
 */
export function formatRelativeTime(isoTimestamp: string, now: number = Date.now()): string {
  const then = new Date(isoTimestamp).getTime()
  const diffMs = now - then
  const diffMinutes = Math.round(diffMs / 60_000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return new Date(isoTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export type NotificationDateGroup = 'Today' | 'Yesterday' | 'Earlier'

/** Calendar-day based (not a rolling 24h window) so "Today"/"Yesterday" match what the customer sees on their own clock's date, not an arbitrary elapsed-hours cutoff. */
export function notificationDateGroup(isoTimestamp: string, now: number = Date.now()): NotificationDateGroup {
  const startOfDay = (ms: number) => {
    const d = new Date(ms)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  const today = startOfDay(now)
  const eventDay = startOfDay(new Date(isoTimestamp).getTime())
  const diffDays = Math.round((today - eventDay) / (24 * 60 * 60 * 1000))

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return 'Earlier'
}
