'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType } from 'react'

export type SidebarNavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> }

/**
 * Extracted from app/dashboard/layout.tsx (Phase 23.3) once a second nav
 * item (Billing) made the previous hardcoded `href === '/dashboard'`
 * "active" check wrong for any route other than the dashboard root.
 * `usePathname()` needs a Client Component; the rest of the dashboard
 * layout (auth check, logout form) stays a Server Component — this is the
 * one small client boundary needed for correct active-state highlighting,
 * not a broader navigation redesign.
 */
export default function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0" aria-label="Primary">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-text-on-dark-muted hover:bg-brand-dark-hover hover:text-text-on-dark aria-[current=page]:bg-brand-dark-hover aria-[current=page]:text-text-on-dark"
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-4 w-4 group-aria-[current=page]:text-brand-vivid" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
