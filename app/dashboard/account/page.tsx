import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import { buttonStyles } from '@/components/ui/button'
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

  return (
    <Container size="md" className="py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
      <p className="mt-1 text-sm text-muted">Your webioom sign-in and account details.</p>

      <Card padding="md" className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Sign-in email</h2>
        <p className="mt-1.5 text-base text-gray-900">{user.email}</p>
      </Card>

      <Card padding="md" className="mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Notifications</h2>
        <p className="mt-1.5 text-sm text-muted">Notification preferences are coming soon.</p>
      </Card>

      <div className="mt-6">
        <form action={logout}>
          <button type="submit" className={buttonStyles({ variant: 'outline' })}>
            Log out
          </button>
        </form>
      </div>
    </Container>
  )
}
