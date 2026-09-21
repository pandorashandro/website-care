import { describe, expect, it } from 'vitest'
import { formatRelativeTime, notificationDateGroup } from '@/lib/monitoring/format-relative-time'

// Constructed via the LOCAL Date constructor (not a UTC ISO string) so
// "local noon" anchors these fixtures — subtracting whole hours from it
// crosses (or doesn't cross) a LOCAL calendar-day boundary the same way
// regardless of which timezone this suite happens to run in.
const FIXED_NOW = new Date(2026, 8, 21, 12, 0, 0, 0).getTime()

describe('formatRelativeTime', () => {
  it('shows "Just now" for anything under a minute old', () => {
    expect(formatRelativeTime(new Date(FIXED_NOW - 10_000).toISOString(), FIXED_NOW)).toBe('Just now')
  })

  it('shows whole minutes under an hour', () => {
    expect(formatRelativeTime(new Date(FIXED_NOW - 5 * 60_000).toISOString(), FIXED_NOW)).toBe('5m ago')
  })

  it('shows whole hours under a day', () => {
    expect(formatRelativeTime(new Date(FIXED_NOW - 3 * 60 * 60_000).toISOString(), FIXED_NOW)).toBe('3h ago')
  })

  it('shows "Yesterday" for exactly one day ago', () => {
    expect(formatRelativeTime(new Date(FIXED_NOW - 24 * 60 * 60_000).toISOString(), FIXED_NOW)).toBe('Yesterday')
  })

  it('shows whole days for 2-6 days ago', () => {
    expect(formatRelativeTime(new Date(FIXED_NOW - 3 * 24 * 60 * 60_000).toISOString(), FIXED_NOW)).toBe('3d ago')
  })

  it('falls back to an absolute date at 7+ days', () => {
    const result = formatRelativeTime(new Date(FIXED_NOW - 10 * 24 * 60 * 60_000).toISOString(), FIXED_NOW)
    expect(result).not.toContain('ago')
    expect(result).toMatch(/[A-Za-z]{3} \d{1,2}, \d{4}/)
  })
})

describe('notificationDateGroup', () => {
  it('groups an event from earlier the same calendar day as "Today"', () => {
    expect(notificationDateGroup(new Date(FIXED_NOW - 6 * 60 * 60_000).toISOString(), FIXED_NOW)).toBe('Today')
  })

  it('groups an event from the previous calendar day as "Yesterday", even if less than 24 elapsed hours ago', () => {
    // FIXED_NOW is 12:00 UTC — 13 hours earlier is 23:00 the PREVIOUS calendar day, not "today minus 13h".
    const thirteenHoursEarlier = new Date(FIXED_NOW - 13 * 60 * 60_000).toISOString()
    expect(notificationDateGroup(thirteenHoursEarlier, FIXED_NOW)).toBe('Yesterday')
  })

  it('groups anything two or more calendar days back as "Earlier"', () => {
    expect(notificationDateGroup(new Date(FIXED_NOW - 2 * 24 * 60 * 60_000).toISOString(), FIXED_NOW)).toBe('Earlier')
  })
})
