'use client'

import { openCookiePreferences } from '@/lib/consent/open-preferences'

/**
 * Cookie Consent V1 — the "reopen preferences" control for places outside
 * the banner itself (the public footer, the account page). A tiny client
 * boundary is unavoidable (dispatching a DOM event requires one), kept as
 * small as possible so the pages that use it stay server components apart
 * from this one control.
 */
export default function CookiePreferencesLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookiePreferences} className={className}>
      Cookie preferences
    </button>
  )
}
