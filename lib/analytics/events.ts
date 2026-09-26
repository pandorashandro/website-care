/**
 * WEBIOOM Product Analytics — the closed catalog of allowed events.
 *
 * This is deliberately the ONLY place a new analytics event name can be
 * introduced. `trackEvent` (lib/analytics/track.ts) is generic over
 * `AnalyticsEventName`, so passing any string not listed here is a
 * TypeScript error, not a silently-accepted typo or an arbitrary
 * unreviewed event reaching GA4/GTM.
 *
 * `AnalyticsEventParams` is equally closed per event: each event's
 * parameter shape is an explicit, narrow object type (or `undefined` for
 * "no parameters"). Object literals passed to `trackEvent` are checked by
 * TypeScript's excess-property rules against these exact shapes, so a call
 * site cannot silently smuggle in an extra field (an email, a name, a
 * database ID, a raw URL) — attempting to would be a compile error, not a
 * runtime PII leak.
 *
 * Only Phase 1's three implemented events are listed. Do not add future
 * roadmap events (website_added, scan_started, scan_completed, scan_failed,
 * report_viewed, ...) here until they are actually implemented.
 */
export const ANALYTICS_EVENTS = ['sign_up', 'login', 'pricing_viewed'] as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number]

export type AnalyticsEventParams = {
  /** GA4 recommended event — fired only after Supabase accepts a new signup (see lib/analytics/track.ts and the signup form). */
  sign_up: { method: 'email' }
  /** GA4 recommended event — fired only after Supabase confirms successful authentication. */
  login: { method: 'email' }
  /** No parameters for V1 — the event itself is the signal. */
  pricing_viewed: undefined
}
