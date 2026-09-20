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
  | 'settings'

const PILLAR_KEYS: ReadonlySet<WebsiteSubNavActive> = new Set([
  'technical-seo',
  'site-architecture',
  'on-page-seo',
  'content',
  'performance',
  'accessibility',
  'security',
])

/** Every pillar route, in the same canonical order used everywhere else (Overview's pillar strip, History's table). Exported so PillarSubNav (the secondary row shown only inside Analysis) can reuse it without a second source of truth. */
export const PILLAR_NAV_ITEMS: { key: WebsiteSubNavActive; label: string; slug: string }[] = [
  { key: 'technical-seo', label: 'Technical SEO', slug: 'technical-seo' },
  { key: 'on-page-seo', label: 'On-Page SEO', slug: 'on-page-seo' },
  { key: 'content', label: 'Content', slug: 'content' },
  { key: 'site-architecture', label: 'Site Architecture', slug: 'site-architecture' },
  { key: 'performance', label: 'Performance', slug: 'performance' },
  { key: 'accessibility', label: 'Accessibility', slug: 'accessibility' },
  { key: 'security', label: 'Security', slug: 'security' },
]

/**
 * Sprint 3, Prompt 2 — Section 9 fix. Replaces the previous 11-item flat
 * tab bar (Sprint 3 Prompt 1's audit: already needed horizontal scroll on
 * a laptop screen, with no affordance showing more tabs existed off-screen)
 * with FOUR grouped top-level destinations:
 *
 *   Overview | Analysis (7 pillars) | Activity | Settings
 *
 * No existing route is removed or orphaned:
 *   - Analysis links to Technical SEO by default; PillarSubNav (rendered
 *     by each of the 7 pillar pages themselves, directly below this nav)
 *     is the second-level selector between the seven — the same
 *     "Category Engine -> dedicated pillar detail" hierarchy the backend
 *     already has, now visible in the nav structure itself.
 *   - Activity now also covers History's own content (Prompt 1's blueprint
 *     calls for merging the two chronological-record surfaces) — History's
 *     route itself stays live and reachable by direct URL, exactly
 *     mirroring the already-established Site Scan precedent below (kept,
 *     not deleted, simply no longer a primary tab).
 *   - Settings routes to the existing Integrations page (its route is left
 *     unchanged deliberately — the Shopify/Wix OAuth callbacks redirect
 *     back to this exact URL after connecting, see the shopify and wix
 *     callback route handlers under app/api/integrations/ — renaming or
 *     moving it would break a live external redirect target for no
 *     presentational benefit). The page
 *     itself now also hosts monitoring preferences (previously stranded on
 *     History), so "Settings" is an honest label for everything it now
 *     contains.
 *
 * PAYABLE-V1 PRODUCT COMPLETION (unchanged from the previous version of
 * this file): "Site Scan" is deliberately NOT one of the tabs below, even
 * though its route still exists (app/dashboard/websites/[id]/site-scan/)
 * and still works — see the original comment history for why. Kept
 * reachable by direct URL only.
 */
export default function WebsiteSubNav({ websiteId, active }: { websiteId: string; active: WebsiteSubNavActive }) {
  const items = [
    { key: 'overview' as const, label: 'Overview', href: `/dashboard/websites/${websiteId}`, isActive: active === 'overview' },
    { key: 'analysis' as const, label: 'Analysis', href: `/dashboard/websites/${websiteId}/technical-seo`, isActive: PILLAR_KEYS.has(active) },
    { key: 'activity' as const, label: 'Activity', href: `/dashboard/websites/${websiteId}/activity`, isActive: active === 'activity' || active === 'history' },
    { key: 'settings' as const, label: 'Settings', href: `/dashboard/websites/${websiteId}/integrations`, isActive: active === 'settings' || active === 'integrations' },
  ]

  return (
    <nav className="mt-4 flex gap-1 border-b border-border" aria-label="Website">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.isActive ? 'page' : undefined}
          className={cn(
            'shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors duration-150 ease-out',
            item.isActive ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-gray-900'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
