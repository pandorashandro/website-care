'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type DisconnectShopifyState = { error?: string } | null

/**
 * Removes webioom's LOCAL record of a Shopify connection only. This does
 * NOT revoke the token on Shopify's side or uninstall webioom from the
 * merchant's Shopify admin — Shopify offers no remote-revocation call as
 * part of this flow, and claiming otherwise would be dishonest. A merchant
 * who wants to fully revoke access must uninstall the app from their
 * Shopify admin directly, exactly the same "local disconnect vs. remote
 * revoke" distinction disconnectWordPress already draws for Application
 * Passwords.
 */
export async function disconnectShopify(
  _prevState: DisconnectShopifyState,
  formData: FormData
): Promise<DisconnectShopifyState> {
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

  // shopify_connections has no anon/authenticated grants (Phase 20.2A-S) —
  // the admin client is required for this delete even though a session
  // exists. Ownership was already independently proven above, via the
  // ordinary session-aware client; the admin client is used purely as a
  // mechanical necessity, never as a substitute for that check.
  const admin = createAdminClient()

  const { error: deleteError } = await admin.from('shopify_connections').delete().eq('website_id', website.id)

  if (deleteError) {
    return { error: 'Could not disconnect Shopify. Please try again.' }
  }

  revalidatePath(`/dashboard/websites/${website.id}`)
  return {}
}
