import Link from 'next/link'
import Logo from '@/components/brand/logo'
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

export default function PublicFooter() {
  return (
    <footer className="border-t border-border-dark bg-brand-dark">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-sm font-semibold text-text-on-dark">{column.heading}</h3>
              <ul className="mt-3 space-y-2">
                {column.items.map((item) => (
                  <li key={item.label} className="text-sm">
                    {item.href ? (
                      <Link href={item.href} className="text-text-on-dark-muted hover:text-text-on-dark">
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

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border-dark pt-6 sm:flex-row">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Logo variant="dark" className="h-11" />
            <p className="text-xs text-text-on-dark-muted">Where Websites Bloom.</p>
          </div>
          <p className="text-sm text-text-on-dark-muted">
            © {new Date().getFullYear()} webioom. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
