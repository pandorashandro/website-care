import Link from 'next/link'
import { cn } from '@/lib/ui/cn'
import { PILLAR_NAV_ITEMS, type WebsiteSubNavActive } from './website-sub-nav'
import { PILLAR_IDENTITY, type PillarKey } from './pillar-identity'

/**
 * Sprint 3, Prompt 2B (structural reset) — the second-level selector
 * between the seven pillar reports, rendered directly below WebsiteSubNav
 * on every pillar page. Each pill now carries its OWN pillar's identity
 * color (from `PILLAR_IDENTITY`, the same mapping used by the pillar grid
 * and each report's own header icon) as its active-state tint, instead of
 * one uniform brand color for all seven — so a customer who has learned
 * "Technical SEO is violet" from the Overview grid sees that same color
 * carried through into the nav itself, reinforcing the pillar system as
 * one coherent identity rather than seven interchangeable tab labels.
 */
export default function PillarSubNav({ websiteId, active }: { websiteId: string; active: WebsiteSubNavActive }) {
  return (
    <nav className="-mt-px flex gap-1.5 overflow-x-auto pb-1 pt-3" aria-label="Analysis pillar">
      {PILLAR_NAV_ITEMS.map((item) => {
        // Every PILLAR_NAV_ITEMS entry is one of the seven pillar routes by
        // construction (see website-sub-nav.tsx's own PILLAR_KEYS set) —
        // WebsiteSubNavActive is a superset only because it also covers
        // non-pillar routes like 'overview'/'settings', which never appear
        // in this array.
        const identity = PILLAR_IDENTITY[item.key as PillarKey]
        const isActive = item.key === active
        return (
          <Link
            key={item.key}
            href={`/dashboard/websites/${websiteId}/${item.slug}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
              isActive ? 'font-semibold' : 'text-muted hover:bg-surface-muted hover:text-gray-900'
            )}
            style={isActive ? { backgroundColor: identity.accentSubtleBg, color: identity.accent } : undefined}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
