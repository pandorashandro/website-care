'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import Logo from '@/components/brand/logo'
import Badge from '@/components/ui/badge'
import { buttonStyles } from '@/components/ui/button'

/**
 * Every item here is now a real route (Phase 18.3). An item without `href`
 * renders as a non-clickable "Soon" placeholder instead of a dead link —
 * kept as an option for future nav items (e.g. Pricing) rather than deleted,
 * since the pattern is still needed going forward.
 */
const NAV_ITEMS: { label: string; href?: string }[] = [
  { label: 'Product', href: '/product' },
  { label: 'Website Health', href: '/website-health' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Resources', href: '/resources' },
]

export default function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="webioom home">
          <Logo className="h-9 sm:h-10" />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="flex items-center gap-1.5 text-sm font-medium text-subtle"
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

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'sm' })}>
            Get Started
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
        <div className="border-t border-border bg-surface px-4 pb-4 lg:hidden">
          <nav className="flex flex-col gap-1 pt-3" aria-label="Primary">
            {NAV_ITEMS.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-2 py-2 text-sm font-medium text-gray-700 hover:bg-surface-muted"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-subtle"
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
