import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { decryptCredential } from '@/lib/security/encryption'

export type ConnectedWordPressCredentials =
  | { ok: true; websiteUrl: string; username: string; applicationPassword: string; displayName: string | null }
  | { ok: false; reason: 'no_connection' }
  | { ok: false; reason: 'decrypt_failed'; displayName: string | null }

/**
 * Shared by every feature that needs to talk to a website's connected
 * WordPress site (capability checks, content mapping, and future fix
 * flows) so ownership verification and credential decryption exist in
 * exactly one place.
 *
 * Independently re-verifies both the Website Care session and website
 * ownership — never trusts that a caller already did so — before ever
 * reading a wordpress_connections row. Only reads the columns actually
 * needed (never select('*')). The decrypted Application Password is
 * returned to the caller for immediate one-time use only; nothing in this
 * module logs it.
 */
export async function getConnectedWordPressCredentials(
  websiteId: string
): Promise<ConnectedWordPressCredentials> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, reason: 'no_connection' }
  }

  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, url')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()

  if (websiteError || !website) {
    return { ok: false, reason: 'no_connection' }
  }

  const { data: connection, error: connectionError } = await supabase
    .from('wordpress_connections')
    .select('status, wp_username, encrypted_app_password, wp_display_name')
    .eq('website_id', website.id)
    .maybeSingle()

  if (connectionError || !connection || connection.status !== 'connected') {
    return { ok: false, reason: 'no_connection' }
  }

  try {
    const applicationPassword = decryptCredential(connection.encrypted_app_password)
    return {
      ok: true,
      websiteUrl: website.url,
      username: connection.wp_username,
      applicationPassword,
      displayName: connection.wp_display_name,
    }
  } catch {
    // A stored credential that can no longer be decrypted (corrupted row,
    // key rotated, etc.) is operationally the same as revoked from the
    // user's point of view — never crash the caller over it.
    return { ok: false, reason: 'decrypt_failed', displayName: connection.wp_display_name }
  }
}
