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
 * Only the currently-implemented events are listed. Do not add future
 * roadmap events (report_viewed, ...) here until they are actually
 * implemented.
 */
export const ANALYTICS_EVENTS = ['sign_up', 'login', 'pricing_viewed', 'website_added', 'scan_started', 'scan_completed', 'scan_failed'] as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number]

export type AnalyticsEventParams = {
  /** GA4 recommended event — fired only after Supabase accepts a new signup (see lib/analytics/track.ts and the signup form). */
  sign_up: { method: 'email' }
  /** GA4 recommended event — fired only after Supabase confirms successful authentication. */
  login: { method: 'email' }
  /** No parameters for V1 — the event itself is the signal. */
  pricing_viewed: undefined
  /**
   * Fired only once a website has been persisted AND survived post-insert
   * entitlement re-verification (see app/dashboard/actions.ts's `addWebsite`
   * and lib/analytics/website-added-marker.ts for the redirect-marker
   * mechanism that reports this server-authoritative outcome from the
   * client). No parameters — never the website's ID, URL, or domain.
   */
  website_added: undefined
  /**
   * Fired only when a genuinely NEW crawl run has been created — never for
   * a resumed already-active run. See
   * lib/analytics/scan-lifecycle.ts/app/dashboard/websites/[id]/scan-website-controls.tsx
   * for the exact `started.ok === true && started.alreadyActive === false`
   * gate and the per-crawl-run dedup this relies on. No parameters — never
   * a crawl run ID, website ID, or URL.
   */
  scan_started: undefined
  /**
   * Fired only once a crawl reaches a genuine successful terminal status
   * ('completed' or 'partial') AND the subsequent category-analysis
   * pipeline has itself finished — not merely when crawling stops. See
   * lib/analytics/scan-lifecycle.ts's `classifyTerminalCrawlStatus`. No
   * parameters — never a score, findings, or any per-website value.
   */
  scan_completed: undefined
  /**
   * Fired only when a crawl reaches a genuine terminal failure status
   * ('failed' or 'cancelled') — never for a stalled/retryable/in-progress
   * state. Mutually exclusive with scan_completed for the same crawl run
   * (see lib/analytics/scan-lifecycle-dedup.ts). No parameters — never an
   * error message or any per-website value.
   */
  scan_failed: undefined
}
