'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CreditCard, UserCircle } from 'lucide-react'

/**
 * Every icon this nav can show. A CLOSED set of serializable string keys —
 * never a component reference — is what crosses the server/client
 * boundary (see SidebarNavItem below); the actual Lucide component
 * functions are only ever imported and used HERE, inside this Client
 * Component, where doing so is unproblematic. There is no serialization
 * rule against a Client Component importing and using a function
 * internally — only against a Server Component passing one to a Client
 * Component as a prop, which is exactly the bug this file fixes (a
 * production runtime error: "Functions cannot be passed directly to
 * Client Components").
 */
const ICONS = {
  dashboard: LayoutDashboard,
  billing: CreditCard,
  account: UserCircle,
} as const

export type SidebarNavIconKey = keyof typeof ICONS

export type SidebarNavItem = { href: string; label: string; icon: SidebarNavIconKey }

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
    <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible lg:px-3" aria-label="Primary">
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className="group relative flex items-center gap-2 whitespace-nowrap rounded-md py-2 pl-4 pr-3 text-sm font-medium text-text-on-dark-muted transition-colors duration-150 ease-out hover:bg-brand-dark-hover hover:text-text-on-dark aria-[current=page]:bg-brand-dark-hover aria-[current=page]:text-text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-vivid"
            aria-current={isActive ? 'page' : undefined}
          >
            <span
              className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-vivid opacity-0 transition-opacity duration-150 ease-out group-aria-[current=page]:opacity-100"
              aria-hidden="true"
            />
            <Icon className="h-4 w-4 group-aria-[current=page]:text-brand-vivid" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
