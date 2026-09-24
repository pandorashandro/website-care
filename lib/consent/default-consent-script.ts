import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from './types'

/**
 * Cookie Consent V1 — the Google Consent Mode v2 DEFAULT, as a plain,
 * dependency-free inline script.
 *
 * WHY THIS MUST BE A RAW SCRIPT, NOT A REACT EFFECT: Google's own guidance
 * (and this task's own explicit requirement) is that Consent Mode defaults
 * must be established before GTM can fire any tag with consent implicitly
 * granted. `<GoogleTagManager>` (@next/third-parties/google) renders its
 * scripts with next/script's default `afterInteractive` strategy — i.e.
 * after hydration. A React client component (even one that runs its effect
 * "as early as possible") still only runs AFTER hydration too, which is
 * already too late relative to an afterInteractive script that could start
 * executing at the same point. The only mechanism in this Next.js version
 * that is GUARANTEED to run strictly before any afterInteractive script,
 * with a documented ordering contract ("executed in the order they are
 * placed", never blocking hydration) is next/script's `beforeInteractive`
 * strategy — see app/layout.tsx, where this string is rendered via exactly
 * that strategy, placed before <GoogleTagManager>.
 *
 * WHY IT READS localStorage SYNCHRONOUSLY, INLINE, RATHER THAN ALWAYS
 * DEFAULTING TO DENIED: a plain <script> tag has no React hydration to
 * desynchronize from — reading localStorage here is safe (unlike doing so
 * during a React render, which would risk a server/client markup
 * mismatch). This lets a RETURNING visitor who already accepted analytics
 * get the correct 'granted' default on this very same page load, instead
 * of a brief incorrect 'denied' flash before a later client component
 * corrects it. A new visitor (no stored consent, or a corrupted/older-
 * version record) safely defaults to fully denied.
 *
 * `wait_for_update` is deliberately NOT set: that option tells GTM to
 * pause tag firing for up to N ms for an ASYNCHRONOUS consent resolution
 * (e.g. a CMP that geolocates the visitor before deciding). Here, the
 * default value pushed above is already the final, correct value at the
 * moment it is pushed — synchronously read from storage, not resolved
 * later — so there is nothing to wait for. The visitor's own later choice
 * (via the banner) is a discrete, open-ended future action, not a bounded
 * resolution window GTM should hold tags open for.
 *
 * GOOGLE-STANDARD COMMAND SHAPE (2026-09-25 correction): a production
 * Tag Assistant investigation found GTM's own "Initializing consent" /
 * "Initialization" lifecycle checks reporting "the default consent state
 * has not yet been set" even though window.dataLayer visibly contained a
 * `['consent','default',{...}]` entry positioned before GTM's own
 * lifecycle markers. Root cause (see that investigation's own report):
 * this script previously pushed a custom-shaped raw array via a
 * differently-named local helper, never defining the conventional
 * `window.gtag` global Google's own reference snippet always defines and
 * calls through. This version defines and calls through `window.gtag`
 * exactly as Google's official Consent Mode installation guide specifies
 * for Tag Manager-only sites (no separate gtag.js):
 *
 *   window.dataLayer = window.dataLayer || [];
 *   function gtag(){ dataLayer.push(arguments); }
 *   gtag('consent', 'default', {...});
 *
 * — see https://developers.google.com/tag-platform/security/guides/consent.
 * No values, timing, or storage logic changed — only the mechanism by
 * which the exact same values reach dataLayer.
 */
export function buildDefaultConsentScript(): string {
  return `(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  var analyticsGranted = false;
  try {
    var raw = window.localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)});
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.version === ${JSON.stringify(CONSENT_VERSION)} && parsed.analytics === true) {
        analyticsGranted = true;
      }
    }
  } catch (e) {}
  gtag('consent', 'default', {
    analytics_storage: analyticsGranted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
})();`
}
