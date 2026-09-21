import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { currentUserHasActiveMonitoring, listNotificationsForCurrentUser } from '@/lib/monitoring/notification-service'
import NotificationsCenter from '@/components/notifications/notifications-center'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [notifications, hasActiveMonitoring] = await Promise.all([listNotificationsForCurrentUser(100), currentUserHasActiveMonitoring()])

  return <NotificationsCenter initialNotifications={notifications} hasActiveMonitoring={hasActiveMonitoring} />
}
