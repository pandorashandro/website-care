'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { encryptCredential } from '@/lib/security/encryption'
import { verifyWordPressCredentials, type VerifyWordPressReason } from '@/lib/integrations/wordpress/client'

const VERIFY_ERROR_MESSAGES: Record<VerifyWordPressReason, string> = {
  invalid_credentials:
    'That username or Application Password was not accepted by WordPress. Double-check both and try again.',
  insufficient_access:
    'Those credentials worked, but this WordPress user does not have enough access. Try an account with at least Author-level permissions.',
  rest_api_unavailable:
    "This site's WordPress REST API could not be found. Make sure it isn't disabled or blocked.",
  unreachable: 'webioom could not reach this WordPress site right now. Please try again shortly.',
  https_required: 'WordPress connections require an HTTPS website.',
  invalid_response:
    'WordPress returned an unexpected response. Please try again, or verify the site is running WordPress.',
  blocked: 'This website address cannot be used for a WordPress connection.',
  timeout: 'The request to WordPress timed out. Please try again.',
}

export type ConnectWordPressState = { error?: string } | null

export async function connectWordPress(
  _prevState: ConnectWordPressState,
  formData: FormData
): Promise<ConnectWordPressState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be logged in to connect WordPress.' }
  }

  const websiteId = formData.get('websiteId') as string | null
  const username = (formData.get('username') as string | null)?.trim() ?? ''
  const applicationPassword = (formData.get('applicationPassword') as string | null) ?? ''

  if (!websiteId) {
    return { error: 'Missing website.' }
  }

  if (!username || !applicationPassword) {
    return { error: 'Enter both your WordPress username and Application Password.' }
  }

  // Ownership must be proven before any verification or write — never trust
  // website_id from form input alone. Every later step uses `website.id`
  // (the row we've just confirmed belongs to this user), not the raw form value.
  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, url')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()

  if (websiteError || !website) {
    return { error: 'Website not found.' }
  }

  let siteUrl: URL
  try {
    siteUrl = new URL(website.url)
  } catch {
    return { error: 'This website does not have a valid URL on file.' }
  }

  if (siteUrl.protocol !== 'https:') {
    return {
      error: 'WordPress connections require an HTTPS website. Update the website URL to use HTTPS first.',
    }
  }

  const verification = await verifyWordPressCredentials(website.url, username, applicationPassword)

  if (!verification.ok) {
    return { error: VERIFY_ERROR_MESSAGES[verification.reason] }
  }

  let encryptedAppPassword: string
  try {
    encryptedAppPassword = encryptCredential(applicationPassword)
  } catch {
    return { error: 'webioom could not securely store this credential. Please contact support.' }
  }

  // website_id is UNIQUE, so this upserts in place rather than creating a
  // duplicate row if a connection already exists. website_id is always the
  // already-ownership-verified `website.id`, never the raw form value, so
  // this can never target another user's connection — RLS enforces the
  // same rule independently underneath.
  const { error: upsertError } = await supabase.from('wordpress_connections').upsert(
    {
      website_id: website.id,
      wp_username: username,
      encrypted_app_password: encryptedAppPassword,
      wp_user_id: verification.user.id,
      wp_display_name: verification.user.displayName,
      status: 'connected',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'website_id' }
  )

  if (upsertError) {
    return { error: 'Could not save the WordPress connection. Please try again.' }
  }

  revalidatePath(`/dashboard/websites/${website.id}`)
  return {}
}

export type DisconnectWordPressState = { error?: string } | null

export async function disconnectWordPress(
  _prevState: DisconnectWordPressState,
  formData: FormData
): Promise<DisconnectWordPressState> {
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

  const { error: deleteError } = await supabase
    .from('wordpress_connections')
    .delete()
    .eq('website_id', website.id)

  if (deleteError) {
    return { error: 'Could not disconnect WordPress. Please try again.' }
  }

  revalidatePath(`/dashboard/websites/${website.id}`)
  return {}
}
