import { CONSENT_STORAGE_KEY, CONSENT_VERSION, type StoredConsent } from './types'

/**
 * Cookie Consent V1 — persistence.
 *
 * localStorage only (no cookie, no server round-trip, no personal data —
 * just `{ version, analytics: boolean }`). Read/write are both guarded
 * against `window`/`localStorage` being unavailable (SSR, privacy modes
 * that block storage, or a thrown QuotaExceededError) — a failure here
 * must never crash the page; it just means the banner shows again, which
 * is the safe direction to fail in.
 */
export function readStoredConsent(): StoredConsent | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredConsent>
    if (parsed.version !== CONSENT_VERSION || typeof parsed.analytics !== 'boolean') return null

    return { version: CONSENT_VERSION, analytics: parsed.analytics }
  } catch {
    return null
  }
}

export function writeStoredConsent(analytics: boolean): StoredConsent {
  const consent: StoredConsent = { version: CONSENT_VERSION, analytics }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent))
    } catch {
      // Storage unavailable/full — the in-memory consent state (and the
      // Google Consent Mode update) still applies for this page view; it
      // just won't be remembered on the next visit.
    }
  }

  return consent
}

/**
 * Pure decision logic extracted from CookieConsentManager so it is directly
 * unit-testable without a DOM/React environment (this project's test suite
 * deliberately runs in plain Node, never jsdom — see vitest.config.ts's own
 * doc comment). The banner is shown exactly when there is no valid, current-
 * version stored choice yet — a returning visitor who already accepted OR
 * rejected analytics never sees it again.
 */
export function shouldShowConsentBanner(stored: StoredConsent | null): boolean {
  return stored === null
}
