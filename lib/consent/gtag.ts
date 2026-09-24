declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

/**
 * Cookie Consent V1 — Google Consent Mode v2 bridge.
 *
 * WEBIOOM does not load gtag.js itself — `@next/third-parties/google`'s
 * `<GoogleTagManager>` (app/layout.tsx) is the ONLY analytics delivery
 * script, and GA4 is configured entirely inside that GTM container (never
 * a second, separately-loaded GA4/gtag.js implementation — see this
 * module's own restraint from importing or hardcoding any measurement ID).
 *
 * Google Consent Mode does not require gtag.js to be present to receive
 * commands — it works by pushing the exact same arguments-array shape
 * gtag() would produce directly onto `window.dataLayer`, which GTM reads
 * once it loads (see the beforeInteractive default script in
 * lib/consent/default-consent-script.ts, which runs before GTM's own
 * script). This function is the ONE place both the default and any later
 * update ever get pushed from, so the two can never drift in shape.
 */
function pushConsentCommand(command: 'default' | 'update', values: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(['consent', command, values])
}

/**
 * Google Consent Mode v2 values for the current analytics choice.
 *
 * Advertising-related consent (`ad_storage`/`ad_user_data`/
 * `ad_personalization`) is ALWAYS denied — WEBIOOM does not run
 * advertising/remarketing tags today. Only `analytics_storage` moves with
 * the visitor's choice.
 */
export function consentValuesFor(analyticsGranted: boolean): Record<string, string> {
  return {
    analytics_storage: analyticsGranted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  }
}

/** Called whenever the visitor's analytics choice changes (Accept all / Reject / Manage preferences → Save) — issues a real-time Consent Mode 'update' command GTM/GA4 act on immediately, without a page reload. */
export function updateGoogleConsent(analyticsGranted: boolean): void {
  pushConsentCommand('update', consentValuesFor(analyticsGranted))
}
