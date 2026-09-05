'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type DisconnectWixState = { error?: string } | null

/**
 * Removes webioom's LOCAL record of a Wix connection only. This does NOT
 * uninstall webioom from the site's Wix dashboard — Wix's own uninstall
 * lifecycle is initiated from within Wix (the site owner removing the app
 * from their site), which fires the App Instance Removed webhook (see
 * app/api/webhooks/wix/uninstalled/route.ts). A merchant who wants to
 * fully remove webioom's access must uninstall the app from their Wix
 * dashboard directly — exactly the same "local disconnect vs. remote
 * uninstall" distinction disconnectShopify already draws for Shopify.
 */
export async function disconnectWix(_prevState: DisconnectWixState, formData: FormData): Promise<DisconnectWixState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be logged in.' }
  }

  const websiteId = formData.get('websiteId') as string | null

  if (!websiteId) {
    return { error: 'Missing website.' }
  }

  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()

  if (websiteError || !website) {
    return { error: 'Website not found.' }
  }

  // wix_connections has no anon/authenticated grants — the admin client is
  // required for this delete even though a session exists. Ownership was
  // already independently proven above, via the ordinary session-aware
  // client; the admin client is used purely as a mechanical necessity,
  // never as a substitute for that check.
  const admin = createAdminClient()

  const { error: deleteError } = await admin.from('wix_connections').delete().eq('website_id', website.id)

  if (deleteError) {
    return { error: 'Could not disconnect Wix. Please try again.' }
  }

  revalidatePath(`/dashboard/websites/${website.id}`)
  return {}
}
