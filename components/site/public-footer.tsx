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
      ...RESOURCES.map((resource) => ({ label: resource.title, href: `/resources/${resource.slug}` })),
    ],
  },
  { heading: 'Company', items: [{ label: 'About' }, { label: 'Contact' }] },
  { heading: 'Legal', items: [{ label: 'Privacy Policy' }, { label: 'Terms of Service' }] },
]

export default function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-sm font-semibold text-gray-900">{column.heading}</h3>
              <ul className="mt-3 space-y-2">
                {column.items.map((item) => (
                  <li key={item.label} className="text-sm">
                    {item.href ? (
                      <Link href={item.href} className="text-muted hover:text-gray-900">
                        {item.label}
                      </Link>
                    ) : (
                      <span className="text-subtle">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <Logo />
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} Website Care. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
