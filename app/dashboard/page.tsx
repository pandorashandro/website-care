import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main>
      <h1>Dashboard</h1>

      <p>You are logged in as:</p>
      <p>{user.email}</p>

      <form action={logout}>
        <button type="submit">Log out</button>
      </form>
    </main>
  )
}