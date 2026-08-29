import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Logo from '@/components/brand/logo'
import { buttonStyles } from '@/components/ui/button'
import { logout } from './actions'

/**
 * Only routes that actually exist belong here. The Phase 18.1 audit found
 * three dead sidebar links (/dashboard/websites, /dashboard/scans,
 * /dashboard/settings) — none of those routes exist, so rather than disable
 * three ghost items for a nav that currently has exactly one real
 * destination, they're removed outright. This array is the only place a
 * future destination needs to be added.
 */
const navItems = [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }]

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

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-text-on-dark-muted hover:bg-brand-dark-hover hover:text-text-on-dark aria-[current=page]:bg-brand-dark-hover aria-[current=page]:text-text-on-dark"
                aria-current={item.href === '/dashboard' ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 group-aria-[current=page]:text-brand-vivid" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>
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
