import Link from 'next/link'
import Logo from '@/components/brand/logo'
import { buttonStyles } from '@/components/ui/button'
import DarkAtmosphere from '@/components/ui/dark-atmosphere'
import { RESOURCES } from '@/lib/content/resources'

type FooterLink = { label: string; href?: string }

/**
 * Product/Resources are now real links (Phase 18.3). Company/Legal remain
 * intentionally unbuilt placeholders — inventing About/Contact/Privacy/Terms
 * copy this early would be dishonest filler (see Phase 18.2 brief), so those
 * items stay non-clickable until there is real content behind them.
 */
const FOOTER_COLUMNS: { heading: string; items: FooterLink[] }[] = [
  {
    heading: 'Product',
    items: [
      { label: 'How It Works', href: '/product' },
      { label: 'Website Health', href: '/website-health' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'Security', href: '/security' },
    ],
  },
  {
    heading: 'Resources',
    items: [
      { label: 'All Resources', href: '/resources' },
      ...RESOURCES.filter((resource) => resource.featured).map((resource) => ({
        label: resource.title,
        href: `/resources/${resource.slug}`,
      })),
    ],
  },
  { heading: 'Company', items: [{ label: 'About' }, { label: 'Contact' }] },
  { heading: 'Legal', items: [{ label: 'Privacy Policy' }, { label: 'Terms of Service' }] },
]

/**
 * Sprint 3, Prompt 2B (public-site rebuild) — was "a generic footer" per
 * the founder's own review. Now opens with a genuine closing CTA moment
 * (a real composition decision, not a color swap) before the link
 * columns, and carries a single thin brand-gradient hairline at the very
 * top — the same restrained "colored edge" convention used throughout the
 * app (pricing cards, pillar headers, Fix These First) — so the site and
 * the product read as the same visual system. No new pages are invented:
 * Company/Legal stay honest non-clickable placeholders exactly as before.
 */
export default function PublicFooter() {
  return (
    <footer className="border-t border-border-dark bg-brand-dark">
      <div className="h-[2px] w-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />

      <div className="relative overflow-hidden border-b border-border-dark">
        <DarkAtmosphere />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-text-on-dark sm:text-3xl">Ready to see your website&rsquo;s health?</h2>
          <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
            Scan your website for free
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-5">
          <div className="sm:col-span-1">
            <Logo variant="dark" className="h-12" />
            <p className="mt-4 text-sm text-text-on-dark-muted">Where Websites Bloom.</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:col-span-4 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.heading}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-on-dark-muted">{column.heading}</h3>
                <ul className="mt-4 space-y-2.5">
                  {column.items.map((item) => (
                    <li key={item.label} className="text-sm">
                      {item.href ? (
                        <Link href={item.href} className="text-text-on-dark-muted transition-colors duration-150 ease-out hover:text-text-on-dark">
                          {item.label}
                        </Link>
                      ) : (
                        <span className="text-text-on-dark-muted/60">{item.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border-dark pt-6 sm:flex-row">
          <p className="text-sm text-text-on-dark-muted">© {new Date().getFullYear()} webioom. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
