/**
 * Cookie Consent V1 — shared vocabulary.
 *
 * `CONSENT_VERSION` is bumped whenever the SHAPE of what a visitor is asked
 * to consent to changes (e.g. a future advertising category is added) — a
 * stored record from an older version is treated as absent (see
 * lib/consent/storage.ts), so the banner is shown again rather than
 * silently reinterpreting a choice the visitor never actually made under
 * the new categories.
 *
 * Deliberately ONE category for V1: `analytics`. WEBIOOM does not use
 * advertising/marketing cookies today — see docs on Google Consent Mode
 * values in lib/consent/gtag.ts for why ad_storage/ad_user_data/
 * ad_personalization stay denied regardless of this choice.
 */
export const CONSENT_VERSION = 1

export const CONSENT_STORAGE_KEY = 'webioom-cookie-consent'

export type StoredConsent = {
  version: typeof CONSENT_VERSION
  /** Whether the visitor has granted analytics (GA4, via GTM) consent. Never stores anything else about the visitor. */
  analytics: boolean
}
