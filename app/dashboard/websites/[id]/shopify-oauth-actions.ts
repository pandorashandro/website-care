'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeShopifyShopDomain } from '@/lib/integrations/shopify/shop-domain'
import { buildShopifyAuthorizeUrl } from '@/lib/integrations/shopify/oauth'

const STATE_TTL_MS = 10 * 60 * 1000 // matches the existing fix-preview-token TTL convention

export type InitiateShopifyConnectState = { error?: string } | null

/**
 * Starts the Shopify OAuth flow for one owned website. Authenticates the
 * session and re-verifies website ownership before anything else — the
 * form's websiteId is never trusted alone. Generates a fresh, single-use,
 * cryptographically random state value, binds it server-side to this exact
 * user + website + shop (see shopify_oauth_states), and redirects to
 * Shopify's own authorize screen. No Shopify token exists and no
 * shopify_connections row is created or modified by this function — a
 * connection is only ever persisted after the callback independently
 * verifies the resulting authorization (see the callback route handler).
 */
export async function initiateShopifyConnect(
  _prevState: InitiateShopifyConnectState,
  formData: FormData
): Promise<InitiateShopifyConnectState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be logged in to connect Shopify.' }
  }

  const websiteId = formData.get('websiteId') as string | null
  const shopInput = (formData.get('shopDomain') as string | null)?.trim() ?? ''

  if (!websiteId) {
    return { error: 'Missing website.' }
  }

  if (!shopInput) {
    return { error: 'Enter your Shopify store address.' }
  }

  const shopDomain = normalizeShopifyShopDomain(shopInput)
  if (!shopDomain) {
    return { error: 'That doesn’t look like a valid Shopify store address.' }
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

  // shopify_oauth_states has no anon/authenticated grants (Phase 20.2A-S) —
  // the admin client is required to insert here even though a session
  // exists. Ownership was already independently proven above, via the
  // ordinary session-aware client, before this point; the admin client is
  // used purely as a mechanical necessity for a table application code
  // otherwise has zero Data-API access to, never as a substitute for that
  // check.
  const admin = createAdminClient()

  const { error: stateError } = await admin.from('shopify_oauth_states').insert({
    state,
    user_id: user.id,
    website_id: website.id,
    shop_domain: shopDomain,
    expires_at: expiresAt,
  })

  if (stateError) {
    return { error: 'webioom could not start the Shopify connection right now. Please try again.' }
  }

  let authorizeUrl: string
  try {
    authorizeUrl = buildShopifyAuthorizeUrl({ shopDomain, state })
  } catch {
    return { error: 'webioom could not start the Shopify connection right now. Please try again.' }
  }

  redirect(authorizeUrl)
}
