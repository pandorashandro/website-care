/**
 * Cookie Consent V1 — cross-tree "reopen preferences" signal.
 *
 * The consent banner/preferences UI lives once, globally, in the root
 * layout's client tree (see components/consent/cookie-consent-manager.tsx),
 * but a "Cookie preferences" link needs to work from places that render in
 * entirely separate subtrees (the public marketing footer, the logged-in
 * account page) with no shared React context between them (this codebase
 * has no existing global-provider pattern to hook into — see the root
 * layout). A plain DOM CustomEvent is the smallest mechanism that lets
 * either side work without wiring a new context provider through every
 * layout in the app.
 */
export const OPEN_COOKIE_PREFERENCES_EVENT = 'webioom:open-cookie-preferences'

export function openCookiePreferences(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT))
}
