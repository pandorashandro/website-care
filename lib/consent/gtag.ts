declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
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
 * GOOGLE-STANDARD COMMAND SHAPE (2026-09-25 correction): a production Tag
 * Assistant investigation found GTM's own consent-initialization checks
 * reporting the default as never set, traced to this module (and the
 * beforeInteractive default script) pushing a custom-shaped raw array
 * directly onto dataLayer instead of defining and calling through the
 * conventional `window.gtag` stub Google's own reference implementation
 * always uses — see https://developers.google.com/tag-platform/security/guides/consent
 * ("function gtag(){dataLayer.push(arguments);}" then "gtag('consent',
 * 'update', {...})"). `ensureGtag` below defines that exact stub (if
 * nothing has already defined `window.gtag` — the beforeInteractive
 * default script normally already has, by the time any of this runs) and
 * every consent command is issued THROUGH it, matching Google's documented
 * pattern exactly. No consent VALUES, timing, or storage logic changed —
 * only the mechanism by which the same values reach dataLayer.
 */
function ensureGtag(): NonNullable<Window['gtag']> {
  window.dataLayer = window.dataLayer || []
  if (!window.gtag) {
    window.gtag = function gtag() {
      // Mirrors Google's own documented gtag() stub exactly
      // (`function gtag(){dataLayer.push(arguments);}`) — `arguments` (not
      // a rest-param array) is what gtag.js itself uses, and what this
      // reimplementation must match for compatibility with GTM's own
      // consent-command recognition.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
  }
  return window.gtag
}

function pushConsentCommand(command: 'default' | 'update', values: Record<string, string>): void {
  if (typeof window === 'undefined') return
  const gtag = ensureGtag()
  gtag('consent', command, values)
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
