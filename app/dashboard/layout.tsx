import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Logo from '@/components/brand/logo'
import SidebarNav, { type SidebarNavItem } from '@/components/dashboard/sidebar-nav'
import WebsiteSwitcher from '@/components/dashboard/website-switcher'

/**
 * Only routes that actually exist belong here. The Phase 18.1 audit found
 * three dead sidebar links (/dashboard/websites, /dashboard/scans,
 * /dashboard/settings) — none of those routes exist, so rather than disable
 * three ghost items for a nav that currently has exactly one real
 * destination, they're removed outright. This array is the only place a
 * future destination needs to be added. Billing added Phase 23.3; Account
 * added Sprint 3 Prompt 2.
 *
 * `icon` is a serializable string key (SidebarNavIconKey), never a Lucide
 * component reference — this file is a Server Component, and SidebarNav
 * (below) is a Client Component; passing an actual component/function
 * across that boundary as a prop is exactly what produced a production
 * runtime error ("Functions cannot be passed directly to Client
 * Components") once the second nav item was added. The icon lookup itself
 * now happens entirely inside sidebar-nav.tsx.
 */
const navItems: SidebarNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/dashboard/billing', label: 'Billing', icon: 'billing' },
  { href: '/dashboard/account', label: 'Account', icon: 'account' },
]

/**
 * Sprint 3, Prompt 2 — Section 7/8 fix: the persistent global sidebar now
 * always answers "which website am I in, and how do I switch" via
 * WebsiteSwitcher at its top, in BOTH the portfolio view and every website
 * workspace — the single biggest structural gap Prompt 1's audit found. No
 * other product-truth change: the same auth check, the same three real
 * nav destinations, the same website ownership boundary (the switcher
 * itself only ever lists websites this exact query already scoped to
 * `user.id`).
 */
export default async function DashboardLayout(props: LayoutProps<'/dashboard'>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: websites } = await supabase.from('websites').select('id, name, url').eq('user_id', user.id).order('created_at', { ascending: true })

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <aside className="flex flex-col border-b border-border-dark bg-brand-dark lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="border-b border-border-dark px-6 py-6">
          <Link
            href="/dashboard"
            aria-label="webioom dashboard"
            className="inline-block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-vivid focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
          >
            <Logo variant="dark" className="h-10" />
          </Link>
        </div>

        <div className="border-b border-border-dark py-4">
          <WebsiteSwitcher websites={websites ?? []} />
        </div>

        <SidebarNav items={navItems} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 bg-background">{props.children}</main>
      </div>
    </div>
  )
}
