import Link from 'next/link'
import { cn } from '@/lib/ui/cn'
import { PILLAR_NAV_ITEMS, type WebsiteSubNavActive } from './website-sub-nav'

/**
 * Sprint 3, Prompt 2 — the second-level selector between the seven pillar
 * reports, rendered directly below WebsiteSubNav on every pillar page (and
 * nowhere else). Makes the existing "Category Engine -> dedicated pillar
 * detail" architecture visible in the navigation itself, and is what lets
 * WebsiteSubNav collapse from 11 flat tabs to 4 groups without hiding any
 * destination — every pillar route is still one click away, just one level
 * deeper.
 */
export default function PillarSubNav({ websiteId, active }: { websiteId: string; active: WebsiteSubNavActive }) {
  return (
    <nav className="-mt-px flex gap-1 overflow-x-auto pb-1 pt-3" aria-label="Analysis pillar">
      {PILLAR_NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={`/dashboard/websites/${websiteId}/${item.slug}`}
          aria-current={item.key === active ? 'page' : undefined}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
            item.key === active ? 'bg-brand-subtle text-brand' : 'text-muted hover:bg-surface-muted hover:text-gray-900'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
