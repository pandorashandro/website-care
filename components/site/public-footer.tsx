import Link from 'next/link'
import Logo from '@/components/brand/logo'
import { buttonStyles } from '@/components/ui/button'
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
 * Sprint 3, Prompt 2B (targeted correction) — the CTA used to live INSIDE
 * the dark `<footer>`, immediately followed by the rest of the dark
 * footer content — two dark blocks back to back visually merged into one
 * oversized dark rectangle, destroying the light/dark rhythm this pass is
 * built around. It's now a light, brand-tinted card sitting on the
 * ordinary page background, rendered as its own section BEFORE the
 * `<footer>` element starts — so the transition reads as
 * "content → premium light CTA → dark footer," three visually distinct
 * moments instead of two dark ones fused together.
 */
function PreFooterCta() {
  return (
    <div className="bg-background px-4 py-16 sm:px-6 sm:py-20">
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface p-10 text-center sm:p-14" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />
        <div className="relative">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Ready to see your website&rsquo;s health?</h2>
          <div className="mt-7">
            <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              Scan your website for free
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Sprint 3, Prompt 2B (public-site rebuild) — was "a generic footer" per
 * the founder's own review; now carries a single thin brand-gradient
 * hairline at the very top — the same restrained "colored edge" convention
 * used throughout the app (pricing cards, pillar headers, Fix These
 * First) — so the site and the product read as the same visual system. No
 * new pages are invented: Company/Legal stay honest non-clickable
 * placeholders exactly as before.
 */
export default function PublicFooter() {
  return (
    <>
      <PreFooterCta />

      <footer className="border-t border-border-dark bg-brand-dark">
        <div className="h-[2px] w-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />

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
    </>
  )
}
