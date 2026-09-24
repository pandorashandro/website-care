'use client'

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/button'
import Modal from '@/components/ui/modal'
import Toggle from '@/components/ui/toggle'
import { readStoredConsent, writeStoredConsent, shouldShowConsentBanner } from '@/lib/consent/storage'
import { updateGoogleConsent } from '@/lib/consent/gtag'
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/consent/open-preferences'

/**
 * Cookie Consent V1 — the one global banner + preferences dialog, mounted
 * once in the root layout (app/layout.tsx) so it is available on every
 * WEBIOOM route, public or logged-in.
 *
 * Google Consent Mode DEFAULTS are already established before this
 * component ever mounts (see lib/consent/default-consent-script.ts's own
 * doc comment — a beforeInteractive raw script, not this React tree). This
 * component's only job is: decide whether the banner needs to be shown at
 * all (nothing stored yet), and issue real-time Consent Mode 'update'
 * commands the moment the visitor actually makes or changes a choice.
 *
 * SSR-SAFE BY CONSTRUCTION: initial state renders nothing (matching what
 * the server produced, since localStorage does not exist there), and the
 * real decision is made inside a `useEffect` that only ever runs on the
 * client, after mount — this is the standard, hydration-safe pattern for
 * consent banners and avoids any server/client markup mismatch.
 */
export default function CookieConsentManager() {
  const [bannerVisible, setBannerVisible] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [analyticsDraft, setAnalyticsDraft] = useState(false)

  useEffect(() => {
    // Deferred one microtask tick, mirroring scan-website-controls.tsx's own
    // established precedent for "sync external state into React on mount"
    // — nothing here actually needs to run synchronously inside the
    // effect's own call stack, and the deferral is what lets this read
    // localStorage and decide the banner's visibility without React
    // flagging a same-tick setState-in-effect cascade.
    async function syncFromStoredConsent() {
      await Promise.resolve()
      const stored = readStoredConsent()
      if (shouldShowConsentBanner(stored)) {
        setBannerVisible(true)
        setAnalyticsDraft(false)
      } else if (stored) {
        setAnalyticsDraft(stored.analytics)
      }
    }

    void syncFromStoredConsent()
  }, [])

  useEffect(() => {
    function handleOpenPreferences() {
      const stored = readStoredConsent()
      setAnalyticsDraft(stored?.analytics ?? false)
      setPreferencesOpen(true)
    }

    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences)
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences)
  }, [])

  const applyChoice = useCallback((analytics: boolean) => {
    writeStoredConsent(analytics)
    updateGoogleConsent(analytics)
    setAnalyticsDraft(analytics)
    setBannerVisible(false)
    setPreferencesOpen(false)
  }, [])

  const handleAcceptAll = useCallback(() => applyChoice(true), [applyChoice])
  const handleRejectNonEssential = useCallback(() => applyChoice(false), [applyChoice])
  const handleSavePreferences = useCallback(() => applyChoice(analyticsDraft), [applyChoice, analyticsDraft])

  return (
    <>
      {bannerVisible && (
        <div
          role="region"
          aria-label="Cookie consent"
          aria-live="polite"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 py-5 shadow-lg sm:px-6"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-gray-900">Your privacy matters</p>
              <p className="mt-1 text-sm text-muted">
                We use necessary technologies to keep webioom working and, with your permission, analytics to understand how the product is used and improve it.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreferencesOpen(true)}>
                Manage preferences
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleRejectNonEssential}>
                Reject non-essential
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={handleAcceptAll}>
                Accept all
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        title="Cookie preferences"
        description="Choose which technologies webioom can use on this device."
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3.5">
            <div>
              <p className="text-sm font-semibold text-gray-900">Necessary</p>
              <p className="mt-0.5 text-sm text-muted">Required to keep webioom secure and working. Cannot be disabled.</p>
            </div>
            <span className="mt-0.5 shrink-0 text-xs font-medium text-subtle">Always active</span>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3.5">
            <div>
              <label htmlFor="cookie-consent-analytics-toggle" className="text-sm font-semibold text-gray-900">
                Analytics
              </label>
              <p className="mt-0.5 text-sm text-muted">Helps us understand how webioom is used so we can improve the product.</p>
            </div>
            <Toggle
              id="cookie-consent-analytics-toggle"
              checked={analyticsDraft}
              onChange={setAnalyticsDraft}
              label="Analytics cookies"
              className="mt-0.5 shrink-0"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={handleAcceptAll}>
            Accept all
          </Button>
          <Button type="button" variant="primary" onClick={handleSavePreferences}>
            Save preferences
          </Button>
        </div>
      </Modal>
    </>
  )
}
