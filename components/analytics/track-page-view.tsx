'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/analytics/track'
import { createPageViewGuard } from '@/lib/analytics/page-view-guard'

/**
 * Fires a no-parameter WEBIOOM page-view analytics event exactly once per
 * genuine mount of the page it's rendered on. Only 'pricing_viewed' exists
 * in Phase 1 — widen this union when a future page-view event (e.g.
 * report_viewed) is actually implemented, not before.
 *
 * Safe against unrelated re-renders (e.g. a sibling's monthly/yearly
 * pricing toggle changing its own state): the guard instance and the
 * effect's mount-only `[]` dependency array both survive re-renders, so a
 * re-render alone can never cause a second push. See
 * lib/analytics/page-view-guard.ts for how this is unit-tested.
 */
export default function TrackPageView({ eventName }: { eventName: 'pricing_viewed' }) {
  const guardRef = useRef<ReturnType<typeof createPageViewGuard> | null>(null)

  useEffect(() => {
    if (!guardRef.current) {
      guardRef.current = createPageViewGuard()
    }
    if (guardRef.current.shouldFire()) {
      trackEvent(eventName)
    }
  }, [eventName])

  return null
}
