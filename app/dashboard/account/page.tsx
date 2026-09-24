import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { UserRound, Bell, ShieldCheck, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import { buttonStyles } from '@/components/ui/button'
import CookiePreferencesLink from '@/components/consent/cookie-preferences-link'
import { logout } from '../actions'

export const metadata: Metadata = { title: 'Account' }

/**
 * Sprint 3, Prompt 2 — the global sidebar's "Account" destination did not
 * exist as a real page before this (logout was a lone button in the
 * dashboard header, with no dedicated account surface at all). Deliberately
 * minimal: account identity + sign out. Notification preferences are
 * explicitly reserved for Sprint 3 Prompt 3 (see that prompt's own
 * "notification preferences" scope) — this page does not fake them.
 */
export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const initial = (user.email ?? '?').charAt(0).toUpperCase()

  return (
    <Container size="md" className="py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
      <p className="mt-1 text-sm text-muted">Your webioom sign-in and account details.</p>

      <Card padding="md" className="mt-6 flex items-center gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
          style={{ background: 'var(--brand-gradient)' }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-900">{user.email}</p>
          <p className="mt-0.5 text-sm text-muted">Signed in</p>
        </div>
      </Card>

      <Card padding="md" className="mt-4">
        <div className="flex items-center gap-2 text-subtle">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Sign-in email</h2>
        </div>
        <p className="mt-2 text-base text-gray-900">{user.email}</p>
      </Card>

      <Card padding="md" className="mt-4">
        <div className="flex items-center gap-2 text-subtle">
          <Bell className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Notifications</h2>
        </div>
        <p className="mt-2 text-sm text-muted">Notification preferences are coming soon.</p>
      </Card>

      <Card padding="md" className="mt-4">
        <div className="flex items-center gap-2 text-subtle">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Privacy</h2>
        </div>
        <p className="mt-2 text-sm text-muted">Manage which optional technologies webioom can use on this device.</p>
        <CookiePreferencesLink className={buttonStyles({ variant: 'outline', size: 'sm', className: 'mt-3' })} />
      </Card>

      <div className="mt-6 border-t border-border pt-6">
        <form action={logout}>
          <button type="submit" className={buttonStyles({ variant: 'outline' })}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </form>
      </div>
    </Container>
  )
}
