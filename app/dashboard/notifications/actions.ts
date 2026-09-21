'use server'

import 'server-only'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Sprint 3 (monitoring + notifications completion). `monitoring_events`
 * grants `authenticated` SELECT only (see the migration), so — exactly like
 * every other privileged write in this codebase (shopify-credentials.ts,
 * monitoring/event-service.ts) — the actual `read_at` write goes through
 * the service-role admin client, but ONLY after the ordinary session
 * client has confirmed the requesting user can even see this event at all.
 * Since `monitoring_events_select_own` RLS already restricts a SELECT to
 * rows whose website belongs to `auth.uid()`, a successful single-row
 * fetch here IS the ownership proof — the same "select first via the
 * session client, then write via admin" shape used throughout this
 * codebase, just with RLS doing the ownership check instead of a manual
 * `.eq('user_id', ...)` filter (there is no `user_id` column on this table
 * to filter by directly).
 */
async function currentUserCanSeeEvent(eventId: string): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase.from('monitoring_events').select('id').eq('id', eventId).maybeSingle()
  return !error && !!data
}

export async function markNotificationRead(eventId: string): Promise<{ ok: boolean }> {
  if (!(await currentUserCanSeeEvent(eventId))) return { ok: false }

  const admin = createAdminClient()
  await admin.from('monitoring_events').update({ read_at: new Date().toISOString() }).eq('id', eventId).is('read_at', null)

  revalidatePath('/dashboard/notifications')
  return { ok: true }
}

/**
 * Unlike a single-event mark-read, there is no per-row RLS-backed select to
 * lean on for "which rows may I touch" — so this resolves the current
 * user's own website ids via the session client first (RLS-scoped, same as
 * every website read elsewhere in this codebase) and passes that exact,
 * bounded id list to the admin client's update, rather than ever letting
 * the admin client decide which rows count as "mine."
 */
export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { data: ownedWebsites } = await supabase.from('websites').select('id').eq('user_id', user.id)
  const websiteIds = (ownedWebsites ?? []).map((website) => website.id)
  if (websiteIds.length === 0) return { ok: true }

  const admin = createAdminClient()
  await admin.from('monitoring_events').update({ read_at: new Date().toISOString() }).in('website_id', websiteIds).is('read_at', null)

  revalidatePath('/dashboard/notifications')
  return { ok: true }
}
