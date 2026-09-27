'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/analytics/track'
import { createPageViewGuard } from '@/lib/analytics/page-view-guard'

/**
 * Fires a no-parameter WEBIOOM page-view analytics event exactly once per
 * genuine mount of the page it's rendered on.
 *
 * Safe against unrelated re-renders (e.g. a sibling's monthly/yearly
 * pricing toggle changing its own state, or a tab/toggle switch elsewhere
 * on the same mounted page): the guard instance and the effect's mount-only
 * `[]` dependency array both survive re-renders, so a re-render alone can
 * never cause a second push. See lib/analytics/page-view-guard.ts for how
 * this is unit-tested.
 *
 * This is deliberately an unpersisted, per-mount-only guard (no
 * localStorage) — a genuine new mount (leaving the page and returning, or a
 * refresh) always gets a fresh guard and may fire again. This is correct
 * for an engagement/view event like `pricing_viewed`/`report_viewed`; it is
 * NOT the pattern used for scan lifecycle events, which persist their dedup
 * state across mounts on purpose (see lib/analytics/scan-lifecycle-dedup.ts).
 *
 * `report_viewed` is rendered conditionally by its caller
 * (app/dashboard/websites/[id]/page.tsx) only when the report is actually
 * eligible (at least one analyzed category) — this component itself has no
 * eligibility logic of its own, so mounting it at all already means "fire."
 */
export default function TrackPageView({ eventName }: { eventName: 'pricing_viewed' | 'report_viewed' }) {
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
