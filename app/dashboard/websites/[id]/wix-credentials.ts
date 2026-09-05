import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential, decryptCredential } from '@/lib/security/encryption'
import { createWixAccessToken } from '@/lib/integrations/wix/client'

type WixConnectionRow = {
  website_id: string
  site_id: string
  encrypted_instance_id: string
  status: string
}

const CONNECTION_COLUMNS = 'website_id, site_id, encrypted_instance_id, status'

/**
 * The ONE authorization check every exported function in this module
 * requires before ever touching wix_connections. Mirrors
 * shopify-credentials.ts's verifyWebsiteOwnership exactly: wix_connections
 * has ZERO grants for the anon/authenticated Postgres roles (see the
 * prepared migration's REVOKE statements), so this application-level
 * check, run against the ordinary session-aware client (which still fully
 * respects `websites`' own RLS), is the entire ownership boundary for
 * every credential read/write below.
 */
async function verifyWebsiteOwnership(websiteId: string): Promise<boolean> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return false

  const { data: website, error } = await supabase.from('websites').select('id').eq('id', websiteId).eq('user_id', user.id).single()

  return !error && !!website
}

/**
 * Reads the connection row via the admin (service-role) client — required
 * because wix_connections has no anon/authenticated grants at all. Callers
 * MUST have already called verifyWebsiteOwnership successfully; this
 * function performs no authorization of its own, by design.
 */
async function getConnectionRowAsAdmin(websiteId: string): Promise<WixConnectionRow | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('wix_connections')
    .select(CONNECTION_COLUMNS)
    .eq('website_id', websiteId)
    .maybeSingle()
    .returns<WixConnectionRow>()

  if (error || !data || data.status !== 'connected') return null
  return data
}

export type WixConnectionSummary = { connected: false } | { connected: true; siteId: string }

/**
 * Ownership-verified, read-only, non-secret summary — never decrypts
 * anything, safe to call anywhere webioom just needs to know "is Wix
 * connected" without exposing the instanceId ciphertext to that caller.
 */
export async function getWixConnectionSummary(websiteId: string): Promise<WixConnectionSummary> {
  if (!(await verifyWebsiteOwnership(websiteId))) return { connected: false }

  const row = await getConnectionRowAsAdmin(websiteId)
  if (!row) return { connected: false }

  return { connected: true, siteId: row.site_id }
}

export type ValidWixAccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'no_connection' | 'decrypt_failed' | 'network_error' | 'malformed_token_response' | 'rejected' }

/**
 * The sole way any future Wix write/read operation obtains a usable access
 * token. Ownership is re-verified via verifyWebsiteOwnership on every
 * call — never cached, never trusted from a caller's own prior lookup.
 *
 * Unlike getValidShopifyAccessToken, there is no "still fresh?" branch or
 * compare-and-swap refresh path: Wix's Client Credentials model (see
 * docs/wix-api-research.md §1) has no refresh token to rotate at all — a
 * fresh access token is simply minted on every call from the durable
 * instanceId plus webioom's own static app credentials. This is
 * deliberately not cached across calls in this foundation; Prompt 2 may
 * add a short-TTL in-memory cache purely as a performance optimization if
 * profiling shows it's warranted, but correctness never depends on it.
 */
export async function getValidWixAccessToken(websiteId: string): Promise<ValidWixAccessTokenResult> {
  if (!(await verifyWebsiteOwnership(websiteId))) return { ok: false, reason: 'no_connection' }

  const row = await getConnectionRowAsAdmin(websiteId)
  if (!row) return { ok: false, reason: 'no_connection' }

  let instanceId: string
  try {
    instanceId = decryptCredential(row.encrypted_instance_id)
  } catch {
    return { ok: false, reason: 'decrypt_failed' }
  }

  const tokenResult = await createWixAccessToken(instanceId)

  if (!tokenResult.ok) {
    if (tokenResult.reason === 'network' || tokenResult.reason === 'timeout') {
      return { ok: false, reason: 'network_error' }
    }
    if (tokenResult.reason === 'malformed_response') {
      return { ok: false, reason: 'malformed_token_response' }
    }
    // 'rejected' — Wix positively refused the client_credentials request
    // (the instance was uninstalled/revoked server-side since we last
    // confirmed it, or credentials no longer match).
    return { ok: false, reason: 'rejected' }
  }

  return { ok: true, accessToken: tokenResult.accessToken }
}

/** Re-exported so wix-oauth-actions.ts's callback route can persist a newly-verified connection without importing encryptCredential directly from two places. */
export { encryptCredential as encryptWixInstanceId }
