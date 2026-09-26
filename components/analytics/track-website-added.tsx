'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/analytics/track'
import { createPageViewGuard } from '@/lib/analytics/page-view-guard'
import { readAndStripWebsiteAddedMarker } from '@/lib/analytics/consume-website-added-marker'

/**
 * Consumes the one-time `website_added` redirect marker `addWebsite`
 * (app/dashboard/actions.ts) appends to its success redirect — see
 * lib/analytics/website-added-marker.ts for why a marker is needed at all
 * (the server action's success path `redirect()`s rather than returning a
 * value the client could otherwise observe).
 *
 * Mounted once on the website Overview page. Reads `window.location`
 * directly (rather than `useSearchParams()`) so this has no interaction
 * with Next's Suspense/prerendering rules for that hook — this is a plain,
 * client-only, mount-time check, nothing more. On mount, if the marker is
 * present: fires `website_added` exactly once (guarded the same way
 * TrackPageView is, so React StrictMode's dev-only double effect
 * invocation can't double-fire it), then rewrites the visible URL to drop
 * only that param via `history.replaceState` — a raw browser API call, not
 * a Next.js navigation, so it triggers no re-render, no re-fetch, and
 * cannot itself cause a second observation of the marker. Any other query
 * parameters (or a hash) already on the URL are preserved untouched.
 *
 * Because the marker is gone from the address bar immediately afterward, a
 * subsequent refresh, a later revisit, or opening the same website's URL
 * directly (without the marker) all correctly see no marker and never
 * re-fire the event.
 */
export default function TrackWebsiteAdded() {
  const guardRef = useRef<ReturnType<typeof createPageViewGuard> | null>(null)

  useEffect(() => {
    if (!guardRef.current) {
      guardRef.current = createPageViewGuard()
    }

    const { markerPresent, cleanedUrl } = readAndStripWebsiteAddedMarker(window.location.href)
    if (!markerPresent) return
    if (!guardRef.current.shouldFire()) return

    trackEvent('website_added')
    window.history.replaceState(null, '', cleanedUrl)
  }, [])

  return null
}
