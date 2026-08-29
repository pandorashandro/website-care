import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeShopifyShopDomain } from '@/lib/integrations/shopify/shop-domain'
import { verifyShopifyWebhookHmac } from '@/lib/integrations/shopify/webhook'

/**
 * Server-to-server delivery from Shopify when a merchant uninstalls
 * webioom — no Supabase user session exists or is expected here, so this
 * uses the admin client, exactly like the OAuth callback. This is the
 * ONLY reliable signal that a stored token has been revoked; without it, a
 * dead connection would otherwise linger until some future API call
 * against it happens to fail.
 *
 * Trust order is strict: the raw body is read and HMAC-verified BEFORE
 * anything else is trusted — the `X-Shopify-Shop-Domain` header is only
 * ever read AFTER that check passes. This is safe specifically because the
 * header and body arrive together as one TLS-protected request from
 * Shopify's own infrastructure: an attacker who lacks the client secret
 * cannot produce a valid HMAC for ANY body, so there is no way to submit a
 * request that passes verification with an attacker-chosen shop-domain
 * header — the only requests that ever pass this check are ones Shopify
 * itself actually sent, header and body together.
 *
 * Idempotent by construction: deleting a shopify_connections row that is
 * already gone (a duplicate delivery, or a shop that was never connected)
 * simply deletes zero rows — never an error, never distinguished from a
 * "real" deletion. No webhook-event-id storage is introduced, since a
 * plain idempotent DELETE by shop domain needs none.
 */
export async function POST(request: NextRequest) {
  // Read the RAW body before anything else — computing the HMAC over a
  // parsed-and-reserialized body would not match Shopify's own digest.
  const rawBody = await request.text()
  const providedHmac = request.headers.get('x-shopify-hmac-sha256')

  if (!verifyShopifyWebhookHmac(rawBody, providedHmac)) {
    return new NextResponse(null, { status: 401 })
  }

  const shopHeader = request.headers.get('x-shopify-shop-domain')
  const shopDomain = shopHeader ? normalizeShopifyShopDomain(shopHeader) : null

  if (!shopDomain) {
    return new NextResponse(null, { status: 400 })
  }

  const admin = createAdminClient()

  // No ownership check is needed or possible here — this deletes by the
  // HMAC-authenticated shop domain itself, not by any user-scoped
  // website_id, which is exactly the correct authority for an uninstall
  // signal (Shopify is the one telling webioom "this installation is
  // gone," independent of which webioom user it happened to belong to).
  await admin.from('shopify_connections').delete().eq('myshopify_domain', shopDomain)

  return new NextResponse(null, { status: 200 })
}
