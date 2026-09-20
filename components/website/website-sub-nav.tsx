import Link from 'next/link'
import { cn } from '@/lib/ui/cn'

export type WebsiteSubNavActive =
  | 'overview'
  | 'site-scan'
  | 'technical-seo'
  | 'site-architecture'
  | 'on-page-seo'
  | 'content'
  | 'performance'
  | 'accessibility'
  | 'security'
  | 'integrations'
  | 'history'
  | 'activity'

/**
 * Small, truthful sub-navigation for a single website. Only real routes
 * belong here — Monitoring/Settings are added only once those routes
 * actually exist, matching the same "no dead links" rule the main dashboard
 * sidebar already follows.
 *
 * PAYABLE-V1 PRODUCT COMPLETION: "Site Scan" is deliberately NOT one of the
 * tabs below, even though its route still exists (app/dashboard/websites/
 * [id]/site-scan/) and still works — it drives the same underlying crawl
 * primitive (startWebsiteCrawl/continueWebsiteCrawl) the canonical "Scan
 * Website" action on Overview also uses, but stops after the crawl and
 * never runs category analysis, so a customer who used it as their entry
 * point would see raw crawl counts with no health score, no findings, and
 * no interpretation — a genuine dead end competing with the ONE canonical
 * "Scan Website" experience. Kept as a reachable (by direct URL) diagnostic
 * page rather than deleted, but no longer offered as a primary nav tab.
 */
export default function WebsiteSubNav({ websiteId, active }: { websiteId: string; active: WebsiteSubNavActive }) {
  const items: { key: WebsiteSubNavActive; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: `/dashboard/websites/${websiteId}` },
    { key: 'technical-seo', label: 'Technical SEO', href: `/dashboard/websites/${websiteId}/technical-seo` },
    { key: 'site-architecture', label: 'Site Architecture', href: `/dashboard/websites/${websiteId}/site-architecture` },
    { key: 'on-page-seo', label: 'On-Page SEO', href: `/dashboard/websites/${websiteId}/on-page-seo` },
    { key: 'content', label: 'Content', href: `/dashboard/websites/${websiteId}/content` },
    { key: 'performance', label: 'Performance', href: `/dashboard/websites/${websiteId}/performance` },
    { key: 'accessibility', label: 'Accessibility', href: `/dashboard/websites/${websiteId}/accessibility` },
    { key: 'security', label: 'Security', href: `/dashboard/websites/${websiteId}/security` },
    { key: 'integrations', label: 'Integrations', href: `/dashboard/websites/${websiteId}/integrations` },
    { key: 'history', label: 'History', href: `/dashboard/websites/${websiteId}/history` },
    { key: 'activity', label: 'Activity', href: `/dashboard/websites/${websiteId}/activity` },
  ]

  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Website">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? 'page' : undefined}
          className={cn(
            'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
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
