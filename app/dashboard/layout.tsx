import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/websites', label: 'Websites' },
  { href: '/dashboard/scans', label: 'Scans' },
  { href: '/dashboard/settings', label: 'Settings' },
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
      <aside className="flex flex-col border-b border-gray-200 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-6 py-5">
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            Website Care
          </span>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 aria-[current=page]:bg-gray-900 aria-[current=page]:text-white"
              aria-current={item.href === '/dashboard' ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4">
          <span className="truncate text-sm text-gray-600">{user.email}</span>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Log out
            </button>
          </form>
        </header>

        <main className="flex-1 bg-gray-50">{props.children}</main>
      </div>
    </div>
  )
}
