import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LayoutDashboard, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Logo from '@/components/brand/logo'
import { buttonStyles } from '@/components/ui/button'
import SidebarNav from '@/components/dashboard/sidebar-nav'
import { logout } from './actions'

/**
 * Only routes that actually exist belong here. The Phase 18.1 audit found
 * three dead sidebar links (/dashboard/websites, /dashboard/scans,
 * /dashboard/settings) — none of those routes exist, so rather than disable
 * three ghost items for a nav that currently has exactly one real
 * destination, they're removed outright. This array is the only place a
 * future destination needs to be added. Billing added Phase 23.3.
 */
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
]

export default async function DashboardLayout(props: LayoutProps<'/dashboard'>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <aside className="flex flex-col border-b border-border-dark bg-brand-dark lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-6 py-5">
          <Link href="/dashboard" aria-label="webioom dashboard">
            <Logo variant="dark" className="h-8" />
          </Link>
        </div>

        <SidebarNav items={navItems} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
          <span className="truncate text-sm text-muted">{user.email}</span>

          <form action={logout}>
            <button type="submit" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
              Log out
            </button>
          </form>
        </header>

        <main className="flex-1 bg-background">{props.children}</main>
      </div>
    </div>
  )
}
