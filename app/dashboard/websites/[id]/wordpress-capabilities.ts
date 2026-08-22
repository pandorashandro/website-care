import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { decryptCredential } from '@/lib/security/encryption'
import {
  checkWordPressCapabilities,
  type WordPressCapabilityResult,
} from '@/lib/integrations/wordpress/capabilities'

export type WordPressConnectionSummary =
  | { connected: false }
  | ({ connected: true; displayName: string | null } & WordPressCapabilityResult)

const REVOKED_UNKNOWN_RESULT: WordPressCapabilityResult = {
  connectionValid: false,
  state: 'revoked',
  capabilities: {
    canEditPosts: 'unknown',
    canEditPages: 'unknown',
    canPublishPosts: 'unknown',
    canUploadMedia: 'unknown',
  },
}

/**
 * Server-side only. Independently re-verifies both the Website Care session
 * and website ownership — never trusts that a caller already did so —
 * before ever reading a wordpress_connections row. Only reads the columns
 * actually needed (never select('*')), decrypts the stored Application
 * Password in a local variable used once to call WordPress, and returns a
 * summary that never includes it (or any other credential) in any form.
 *
 * If there is no 'connected' row, returns { connected: false } without
 * attempting decryption or any authenticated WordPress request.
 */
export async function getWordPressConnectionSummary(
  websiteId: string
): Promise<WordPressConnectionSummary> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { connected: false }
  }

  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, url')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()

  if (websiteError || !website) {
    return { connected: false }
  }

  const { data: connection, error: connectionError } = await supabase
    .from('wordpress_connections')
    .select('status, wp_username, encrypted_app_password, wp_display_name')
    .eq('website_id', website.id)
    .maybeSingle()

  if (connectionError || !connection || connection.status !== 'connected') {
    return { connected: false }
  }

  let applicationPassword: string
  try {
    applicationPassword = decryptCredential(connection.encrypted_app_password)
  } catch {
    // A stored credential that can no longer be decrypted (corrupted row,
    // key rotated, etc.) is operationally the same as a revoked one from
    // the user's point of view — never crash the report over it.
    return {
      connected: true,
      displayName: connection.wp_display_name,
      ...REVOKED_UNKNOWN_RESULT,
    }
  }

  const capabilityResult = await checkWordPressCapabilities(
    website.url,
    connection.wp_username,
    applicationPassword
  )

  return {
    connected: true,
    displayName: connection.wp_display_name,
    ...capabilityResult,
  }
}
