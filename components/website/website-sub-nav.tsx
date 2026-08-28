import Link from 'next/link'
import { cn } from '@/lib/ui/cn'

export type WebsiteSubNavActive = 'overview' | 'integrations' | 'activity'

/**
 * Small, truthful sub-navigation for a single website. Only real routes
 * belong here — Monitoring/Settings are added only once those routes
 * actually exist, matching the same "no dead links" rule the main dashboard
 * sidebar already follows.
 */
export default function WebsiteSubNav({ websiteId, active }: { websiteId: string; active: WebsiteSubNavActive }) {
  const items: { key: WebsiteSubNavActive; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: `/dashboard/websites/${websiteId}` },
    { key: 'integrations', label: 'Integrations', href: `/dashboard/websites/${websiteId}/integrations` },
    { key: 'activity', label: 'Activity', href: `/dashboard/websites/${websiteId}/activity` },
  ]

  return (
    <nav className="mt-4 flex gap-1 border-b border-border" aria-label="Website">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? 'page' : undefined}
          className={cn(
            'border-b-2 px-3 py-2 text-sm font-medium',
            item.key === active
              ? 'border-brand text-brand'
              : 'border-transparent text-muted hover:text-gray-900'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
