import { readStoredConsent } from '@/lib/consent/storage'
import { ANALYTICS_EVENTS, type AnalyticsEventName, type AnalyticsEventParams } from './events'

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

/**
 * WEBIOOM Product Analytics — the ONLY function allowed to push a WEBIOOM
 * product event to `dataLayer`. It deliberately does NOT install gtag.js,
 * does NOT create a second Google Tag, and does NOT hardcode a GA4
 * Measurement ID — it pushes a plain GTM-custom-event object
 * (`{ event: 'sign_up', method: 'email' }`) onto the SAME `dataLayer`
 * `@next/third-parties/google`'s `<GoogleTagManager>` (app/layout.tsx)
 * already reads, exactly the shape a GTM Custom Event trigger is built to
 * match. GA4 configuration (whether/how this reaches GA4) lives entirely
 * inside the GTM container, not in this code.
 *
 * Consent: reuses the SAME consent record `lib/consent/storage.ts` already
 * persists (no second consent system). If analytics consent has not been
 * granted, no WEBIOOM product event is pushed at all — this is a stronger,
 * belt-and-suspenders gate in addition to (not a replacement for) Consent
 * Mode's own tag-blocking behavior inside GTM, which this module never
 * touches.
 *
 * Never throws: an analytics failure (storage unavailable, a future bug)
 * must never break or block the product action it's attached to, so every
 * exit path here is either a silent early return or is caught.
 */
function isAnalyticsConsentGranted(): boolean {
  return readStoredConsent()?.analytics === true
}

type TrackEventArgs<E extends AnalyticsEventName> = AnalyticsEventParams[E] extends undefined
  ? []
  : [params: AnalyticsEventParams[E]]

export function trackEvent<E extends AnalyticsEventName>(event: E, ...args: TrackEventArgs<E>): void {
  try {
    if (typeof window === 'undefined') return
    if (!ANALYTICS_EVENTS.includes(event)) return
    if (!isAnalyticsConsentGranted()) return

    const params = args[0]
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event, ...(params ?? {}) })
  } catch {
    // Analytics must never affect product behavior.
  }
}
