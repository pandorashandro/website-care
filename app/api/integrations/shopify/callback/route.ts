import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential } from '@/lib/security/encryption'
import { normalizeShopifyShopDomain } from '@/lib/integrations/shopify/shop-domain'
import { parseShopifyCallbackParams, verifyShopifyCallbackHmac, exchangeShopifyAuthorizationCode } from '@/lib/integrations/shopify/oauth'
import { verifyShopifyIdentity } from '@/lib/integrations/shopify/client'

type ShopifyOAuthStateRow = {
  state: string
  user_id: string
  website_id: string
  shop_domain: string
  expires_at: string
}

/**
 * Shopify's OAuth redirect target. Deliberately requires NO active webioom
 * session — a cross-site redirect chain through Shopify's own domain and
 * back is exactly the scenario where relying on session cookies is least
 * dependable (browser-dependent SameSite behavior). Because there may be no
 * authenticated request context here at all, this route uses the
 * server-only admin client (lib/supabase/admin.ts) rather than the
 * ordinary session-aware one — there is nothing else it could safely use.
 *
 * Ownership is proven entirely through possession of the exact, unexpired,
 * single-use `state` value that initiateShopifyConnect issued after
 * independently verifying session + website ownership (via the ordinary,
 * RLS-respecting client, in that action) — never from anything in this
 * request's own query string. The `website_id` this callback ever writes
 * to is always the value read back from the atomically-consumed state row
 * below, never a client-submitted or callback-supplied value.
 *
 * State consumption is a single atomic `DELETE ... RETURNING` statement —
 * Supabase's `.delete().select()` issues exactly one SQL statement per
 * PostgREST's `Prefer: return=representation` semantics, not a separate
 * SELECT-then-DELETE round trip, so this has no read-then-write race
 * regardless of which client issues it. Using the admin client here is not
 * what makes this atomic; it's required only because shopify_oauth_states
 * has no anon/authenticated grants for this session-less request to use
 * otherwise.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const params = parseShopifyCallbackParams(searchParams)
  if (!params) {
    return redirectWithError(request, null, 'malformed_callback')
  }

  // HMAC verification happens before ANYTHING else touches the database —
  // an invalid signature means this request cannot be trusted to represent
  // Shopify at all, regardless of what the other parameters claim.
  if (!verifyShopifyCallbackHmac(searchParams)) {
    return redirectWithError(request, null, 'invalid_hmac')
  }

  const callbackShopDomain = normalizeShopifyShopDomain(params.shop)
  if (!callbackShopDomain) {
    return redirectWithError(request, null, 'invalid_shop')
  }

  const admin = createAdminClient()

  // Atomically consume the state row: this DELETE...RETURNING can only
  // ever succeed once for a given state value. A second callback replaying
  // the same state (or a state that was never issued, or has expired)
  // finds zero rows and fails closed here — never re-runs the exchange or
  // persistence below.
  const { data: stateRow, error: stateError } = await admin
    .from('shopify_oauth_states')
    .delete()
    .eq('state', params.state)
    .gt('expires_at', new Date().toISOString())
    .select('state, user_id, website_id, shop_domain, expires_at')
    .maybeSingle()
    .returns<ShopifyOAuthStateRow>()

  if (stateError || !stateRow) {
    return redirectWithError(request, null, 'invalid_or_expired_state')
  }

  const websiteId = stateRow.website_id

  if (stateRow.shop_domain !== callbackShopDomain) {
    return redirectWithError(request, websiteId, 'shop_mismatch')
  }

  const exchangeResult = await exchangeShopifyAuthorizationCode({
    shopDomain: callbackShopDomain,
    code: params.code,
  })

  if (!exchangeResult.ok) {
    return redirectWithError(request, websiteId, `code_exchange_${exchangeResult.reason}`)
  }

  const { token } = exchangeResult

  // Independently re-derive identity from Shopify itself rather than
  // trusting the callback's own `shop` parameter as sufficient proof that
  // the issued token actually belongs to that shop.
  const identityResult = await verifyShopifyIdentity(callbackShopDomain, token.accessToken)

  if (!identityResult.ok) {
    return redirectWithError(request, websiteId, `verification_${identityResult.reason}`)
  }

  if (identityResult.identity.myshopifyDomain !== callbackShopDomain) {
    return redirectWithError(request, websiteId, 'identity_mismatch')
  }

  const now = Date.now()

  // website_id is always stateRow.website_id — proven ownership from the
  // initiation step — never anything derived from this request's own
  // query string. One connection per website: upsert in place on conflict,
  // mirroring wordpress_connections' existing reconnect behavior exactly.
  const { error: upsertError } = await admin.from('shopify_connections').upsert(
    {
      website_id: websiteId,
      myshopify_domain: callbackShopDomain,
      encrypted_access_token: encryptCredential(token.accessToken),
      encrypted_refresh_token: encryptCredential(token.refreshToken),
      access_token_expires_at: new Date(now + token.expiresInSeconds * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + token.refreshTokenExpiresInSeconds * 1000).toISOString(),
      granted_scopes: token.scope,
      status: 'connected',
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: 'website_id' }
  )

  if (upsertError) {
    return redirectWithError(request, websiteId, 'storage_failed')
  }

  return NextResponse.redirect(new URL(`/dashboard/websites/${websiteId}/integrations?shopify=connected`, request.url))
}

function redirectWithError(request: NextRequest, websiteId: string | null, reason: string): NextResponse {
  const target = websiteId ? `/dashboard/websites/${websiteId}/integrations` : '/dashboard'
  const url = new URL(target, request.url)
  url.searchParams.set('shopify', 'error')
  url.searchParams.set('shopifyReason', reason)
  return NextResponse.redirect(url)
}
