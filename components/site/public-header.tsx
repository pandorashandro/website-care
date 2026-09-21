'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import Logo from '@/components/brand/logo'
import Badge from '@/components/ui/badge'
import { buttonStyles } from '@/components/ui/button'
import { cn } from '@/lib/ui/cn'

/**
 * Every item here is now a real route (Phase 18.3; Pricing added Phase
 * 23.3). An item without `href` renders as a non-clickable "Soon"
 * placeholder instead of a dead link — kept as an option for future nav
 * items rather than deleted, since the pattern is still needed going
 * forward.
 */
const NAV_ITEMS: { label: string; href?: string }[] = [
  { label: 'Product', href: '/product' },
  { label: 'Website Health', href: '/website-health' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/resources' },
]

/**
 * Sprint 3, Prompt 2B (public-site rebuild) — the founder's own visual
 * inspection called this "a generic white navbar with text links." It is
 * now sticky with a scroll-aware frosted surface (a restrained, real
 * interaction moment rather than a static bar), pill-style active/hover
 * states instead of a plain underline, and a subtle brand-gradient glow
 * behind the primary CTA — enough presence to read as "the entrance to a
 * premium product" without becoming a mega-nav the current five-item,
 * flat-route structure doesn't actually need.
 */
export default function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (!mobileOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200 ease-out',
        scrolled ? 'border-border bg-surface/85 shadow-sm backdrop-blur-md' : 'border-transparent bg-surface/60 backdrop-blur-sm'
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2" aria-label="webioom home">
          <Logo className="h-12 sm:h-14" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                  pathname === item.href ? 'bg-brand-subtle text-brand' : 'text-gray-600 hover:bg-surface-muted hover:text-gray-900'
                )}
              >
                {item.label}
              </Link>
            ) : (
              <span key={item.label} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-subtle" aria-disabled="true">
                {item.label}
                <Badge tone="neutral" className="text-[10px]">
                  Soon
                </Badge>
              </span>
            )
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            Log in
          </Link>
          <Link href="/signup" className="group relative">
            <span
              className="absolute -inset-1 rounded-lg opacity-0 blur-md transition-opacity duration-200 ease-out group-hover:opacity-40 motion-reduce:hidden"
              style={{ background: 'var(--brand-gradient)' }}
              aria-hidden="true"
            />
            <span className={buttonStyles({ variant: 'primary', size: 'sm', className: 'relative' })}>Get Started</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          className="rounded-md p-2 text-gray-700 hover:bg-surface-muted lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-surface px-4 pb-4 motion-safe:animate-[webioom-rise-in_var(--duration-base)_var(--ease-out)_both] lg:hidden">
          <nav className="flex flex-col gap-1 pt-3" aria-label="Primary">
            {NAV_ITEMS.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-2.5 text-sm font-medium',
                    pathname === item.href ? 'bg-brand-subtle text-brand' : 'text-gray-700 hover:bg-surface-muted'
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium text-subtle"
                  aria-disabled="true"
                >
                  {item.label}
                  <Badge tone="neutral" className="text-[10px]">
                    Soon
                  </Badge>
                </span>
              )
            )}
          </nav>

          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <Link href="/login" className={buttonStyles({ variant: 'outline', className: 'w-full' })}>
              Log in
            </Link>
            <Link href="/signup" className={buttonStyles({ variant: 'primary', className: 'w-full' })}>
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
