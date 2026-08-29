import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential, decryptCredential } from '@/lib/security/encryption'
import { refreshShopifyAccessToken } from '@/lib/integrations/shopify/oauth'

/**
 * How far before the persisted expiry webioom proactively refreshes,
 * rather than risking a request starting with a token that expires
 * mid-flight. Shopify's own access tokens live 60 minutes — 2 minutes is a
 * small, safe margin relative to that.
 */
const ACCESS_TOKEN_SAFETY_MARGIN_MS = 2 * 60 * 1000

type ShopifyConnectionRow = {
  website_id: string
  myshopify_domain: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  access_token_expires_at: string
  refresh_token_expires_at: string
  granted_scopes: string
  status: string
}

const CONNECTION_COLUMNS =
  'website_id, myshopify_domain, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, refresh_token_expires_at, granted_scopes, status'

/**
 * The ONE authorization check every exported function in this module
 * requires before ever touching shopify_connections. `shopify_connections`
 * has ZERO grants for the anon/authenticated Postgres roles (see the
 * Phase 20.2A-S migration) — there is no RLS fallback on that table for
 * ordinary Supabase clients to rely on at all, so this application-level
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
 * because shopify_connections has no anon/authenticated grants at all.
 * Callers MUST have already called verifyWebsiteOwnership successfully;
 * this function performs no authorization of its own, by design (it has no
 * concept of "the current user" — the service-role client bypasses RLS
 * entirely).
 */
async function getConnectionRowAsAdmin(websiteId: string): Promise<ShopifyConnectionRow | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('shopify_connections')
    .select(CONNECTION_COLUMNS)
    .eq('website_id', websiteId)
    .maybeSingle()
    .returns<ShopifyConnectionRow>()

  if (error || !data || data.status !== 'connected') return null
  return data
}

export type ShopifyConnectionSummary =
  | { connected: false }
  | { connected: true; myshopifyDomain: string; grantedScopes: string[] }

/**
 * Ownership-verified, read-only, non-secret summary — never decrypts
 * anything, safe to call anywhere webioom just needs to know "is Shopify
 * connected" (e.g. future UI) without exposing credential ciphertext to
 * that caller at all.
 */
export async function getShopifyConnectionSummary(websiteId: string): Promise<ShopifyConnectionSummary> {
  if (!(await verifyWebsiteOwnership(websiteId))) return { connected: false }

  const row = await getConnectionRowAsAdmin(websiteId)
  if (!row) return { connected: false }

  return {
    connected: true,
    myshopifyDomain: row.myshopify_domain,
    grantedScopes: row.granted_scopes.split(',').filter(Boolean),
  }
}

export type ValidShopifyAccessTokenResult =
  | { ok: true; myshopifyDomain: string; accessToken: string }
  | {
      ok: false
      reason: 'no_connection' | 'decrypt_failed' | 'refresh_token_expired' | 'refresh_failed' | 'network_error' | 'malformed_token_response'
    }

/**
 * The sole way any future Shopify write/read operation obtains a usable
 * access token. Ownership is re-verified via verifyWebsiteOwnership on
 * every call — never cached, never trusted from a caller's own prior
 * lookup. Refreshes proactively when the stored access token is at or past
 * its safety margin, using the smallest correct concurrency pattern
 * available without new infrastructure: a compare-and-swap UPDATE (via the
 * admin client, scoped to the exact encrypted access token this call
 * read). If a concurrent call already refreshed and persisted a newer
 * token first, this call's own UPDATE affects zero rows — rather than
 * overwriting the newer pair with a stale one, it re-reads the row a
 * second time and uses whatever is current.
 */
export async function getValidShopifyAccessToken(websiteId: string): Promise<ValidShopifyAccessTokenResult> {
  if (!(await verifyWebsiteOwnership(websiteId))) return { ok: false, reason: 'no_connection' }

  const row = await getConnectionRowAsAdmin(websiteId)
  if (!row) return { ok: false, reason: 'no_connection' }

  return resolveValidAccessToken(websiteId, row, /* alreadyRetried */ false)
}

async function resolveValidAccessToken(
  websiteId: string,
  row: ShopifyConnectionRow,
  alreadyRetried: boolean
): Promise<ValidShopifyAccessTokenResult> {
  const accessTokenExpiresAt = new Date(row.access_token_expires_at).getTime()
  const stillFresh = Number.isFinite(accessTokenExpiresAt) && accessTokenExpiresAt - Date.now() > ACCESS_TOKEN_SAFETY_MARGIN_MS

  if (stillFresh) {
    let accessToken: string
    try {
      accessToken = decryptCredential(row.encrypted_access_token)
    } catch {
      return { ok: false, reason: 'decrypt_failed' }
    }
    return { ok: true, myshopifyDomain: row.myshopify_domain, accessToken }
  }

  const refreshTokenExpiresAt = new Date(row.refresh_token_expires_at).getTime()
  if (!Number.isFinite(refreshTokenExpiresAt) || refreshTokenExpiresAt <= Date.now()) {
    return { ok: false, reason: 'refresh_token_expired' }
  }

  let refreshToken: string
  try {
    refreshToken = decryptCredential(row.encrypted_refresh_token)
  } catch {
    return { ok: false, reason: 'decrypt_failed' }
  }

  const refreshResult = await refreshShopifyAccessToken({ shopDomain: row.myshopify_domain, refreshToken })

  if (!refreshResult.ok) {
    if (refreshResult.reason === 'network' || refreshResult.reason === 'timeout') {
      return { ok: false, reason: 'network_error' }
    }
    if (refreshResult.reason === 'malformed_response') {
      return { ok: false, reason: 'malformed_token_response' }
    }
    // 'rejected' — Shopify positively refused the refresh token (revoked,
    // expired server-side, or the app's installation no longer exists).
    return { ok: false, reason: 'refresh_failed' }
  }

  const { token } = refreshResult
  const now = Date.now()

  const admin = createAdminClient()

  // Compare-and-swap: only succeeds if no one else has already persisted a
  // newer token pair for this connection since we read `row` above.
  const { data: updated, error: updateError } = await admin
    .from('shopify_connections')
    .update({
      encrypted_access_token: encryptCredential(token.accessToken),
      encrypted_refresh_token: encryptCredential(token.refreshToken),
      access_token_expires_at: new Date(now + token.expiresInSeconds * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + token.refreshTokenExpiresInSeconds * 1000).toISOString(),
      granted_scopes: token.scope,
      updated_at: new Date(now).toISOString(),
    })
    .eq('website_id', websiteId)
    .eq('encrypted_access_token', row.encrypted_access_token)
    .select(CONNECTION_COLUMNS)
    .maybeSingle()
    .returns<ShopifyConnectionRow>()

  if (updateError) {
    return { ok: false, reason: 'refresh_failed' }
  }

  if (updated) {
    return { ok: true, myshopifyDomain: updated.myshopify_domain, accessToken: token.accessToken }
  }

  // Zero rows affected: a concurrent call already won the race and
  // persisted a different (newer) pair first. Re-read once and use
  // whatever is now current — this call's own freshly-minted (but
  // discarded) token pair is simply not persisted, which is safe: Shopify
  // tolerates the prior refresh token remaining briefly usable, so nothing
  // is lost by not storing this one.
  if (alreadyRetried) {
    return { ok: false, reason: 'refresh_failed' }
  }

  const fresh = await getConnectionRowAsAdmin(websiteId)
  if (!fresh) return { ok: false, reason: 'no_connection' }

  return resolveValidAccessToken(websiteId, fresh, /* alreadyRetried */ true)
}
