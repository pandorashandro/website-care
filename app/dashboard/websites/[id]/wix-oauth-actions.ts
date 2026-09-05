'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWixAppConfig } from '@/lib/integrations/wix/config'
import { buildWixInstallUrl } from '@/lib/integrations/wix/install'

const STATE_TTL_MS = 10 * 60 * 1000 // matches shopify_oauth_states' existing TTL convention

export type InitiateWixConnectState = { error?: string } | null

/**
 * Starts the Wix External Install Flow for one owned website. Authenticates
 * the session and re-verifies website ownership before anything else — the
 * form's websiteId is never trusted alone. Generates a fresh, single-use,
 * cryptographically random state value, binds it server-side to this exact
 * user + website (see wix_oauth_states), and redirects to Wix's own
 * app-installer URL.
 *
 * Unlike initiateShopifyConnect, there is no shop-domain text field for the
 * user to fill in — Wix's install flow has no equivalent free-text entry;
 * the site is chosen entirely within Wix's own UI after redirect, and the
 * resulting `tenantId`/`instanceId` (cryptographically proven via
 * `signedInstance`) tell webioom which site was actually connected. See
 * docs/wix-api-research.md §7.5 for what this does and does not prove.
 *
 * No Wix instanceId exists and no wix_connections row is created or
 * modified by this function — a connection is only ever persisted after
 * the callback independently verifies the resulting install (see the
 * callback route handler, not yet implemented this phase — see final
 * report).
 */
export async function initiateWixConnect(
  _prevState: InitiateWixConnectState,
  formData: FormData
): Promise<InitiateWixConnectState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be logged in to connect Wix.' }
  }

  const websiteId = formData.get('websiteId') as string | null

  if (!websiteId) {
    return { error: 'Missing website.' }
  }

  // Ownership must be proven before any state is created — every later
  // step uses `website.id` (the row just confirmed to belong to this
  // user), never the raw form value.
  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()

  if (websiteError || !website) {
    return { error: 'Website not found.' }
  }

  const state = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()

  // wix_oauth_states has no anon/authenticated grants (see the prepared
  // migration) — the admin client is required to insert here even though a
  // session exists. Ownership was already independently proven above, via
  // the ordinary session-aware client, before this point; the admin client
  // is used purely as a mechanical necessity, never as a substitute for
  // that check.
  const admin = createAdminClient()

  const { error: stateError } = await admin.from('wix_oauth_states').insert({
    state,
    user_id: user.id,
    website_id: website.id,
    expires_at: expiresAt,
  })

  if (stateError) {
    return { error: 'webioom could not start the Wix connection right now. Please try again.' }
  }

  let installUrl: string
  try {
    const { appUrl } = getWixAppConfig()
    const callbackUrl = new URL('/api/integrations/wix/callback', appUrl)
    callbackUrl.searchParams.set('state', state)
    installUrl = buildWixInstallUrl({ callbackUrl: callbackUrl.toString() })
  } catch {
    return { error: 'webioom could not start the Wix connection right now. Please try again.' }
  }

  redirect(installUrl)
}
