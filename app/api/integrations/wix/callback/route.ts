import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential } from '@/lib/security/encryption'
import { verifyWixSignedInstance } from '@/lib/integrations/wix/install'

type WixOAuthStateRow = {
  state: string
  user_id: string
  website_id: string
  expires_at: string
}

/**
 * Wix's External Install Flow redirect target. Mirrors the Shopify OAuth
 * callback's trust model closely, adapted for Wix's mechanics:
 *
 * - Uses the server-only admin client, exactly like the Shopify callback —
 *   there may be no authenticated webioom session in this request context
 *   (the browser has just been redirected back from Wix's own domain).
 * - Ownership is proven entirely through possession of the exact,
 *   unexpired, single-use `state` value initiateWixConnect issued after
 *   independently verifying session + website ownership. The `website_id`
 *   this callback ever writes to is always the value read back from the
 *   atomically-consumed state row, never a client-submitted or
 *   callback-supplied value.
 * - `signedInstance` is verified BEFORE anything else is trusted — Wix's
 *   own docs warn `instanceId`/`tenantId` on their own are not proof of a
 *   successful install (query parameters can be forged). See
 *   lib/integrations/wix/install.ts's verifyWixSignedInstance doc comment
 *   for the specific format used and the documented gap around it
 *   (docs/wix-api-research.md §3) — confirming this against a real Wix
 *   install is required before Beta.
 * - As a second layer, the decoded `signedInstance` payload's own
 *   `instanceId` must match the plain-text `instanceId` query parameter
 *   Wix also sent — any mismatch fails closed rather than trusting either
 *   value alone.
 *
 * State consumption is a single atomic `DELETE ... RETURNING` — identical
 * reasoning to the Shopify callback's own comment on this point.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const state = searchParams.get('state')
  const instanceId = searchParams.get('instanceId')
  const tenantId = searchParams.get('tenantId')
  const signedInstance = searchParams.get('signedInstance')

  if (!state || !instanceId || !tenantId || !signedInstance) {
    return redirectWithError(request, null, 'malformed_callback')
  }

  const verified = verifyWixSignedInstance(signedInstance)
  if (!verified.ok) {
    return redirectWithError(request, null, `signature_${verified.reason}`)
  }

  if (verified.payload.instanceId !== instanceId) {
    return redirectWithError(request, null, 'instance_mismatch')
  }

  const admin = createAdminClient()

  // Atomically consume the state row: this DELETE...RETURNING can only
  // ever succeed once for a given state value. A second callback replaying
  // the same state (or a state that was never issued, or has expired)
  // finds zero rows and fails closed here — never re-runs the persistence
  // below.
  const { data: stateRow, error: stateError } = await admin
    .from('wix_oauth_states')
    .delete()
    .eq('state', state)
    .gt('expires_at', new Date().toISOString())
    .select('state, user_id, website_id, expires_at')
    .maybeSingle()
    .returns<WixOAuthStateRow>()

  if (stateError || !stateRow) {
    return redirectWithError(request, null, 'invalid_or_expired_state')
  }

  const websiteId = stateRow.website_id

  const { error: upsertError } = await admin.from('wix_connections').upsert(
    {
      website_id: websiteId,
      site_id: tenantId,
      encrypted_instance_id: encryptCredential(instanceId),
      status: 'connected',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'website_id' }
  )

  if (upsertError) {
    return redirectWithError(request, websiteId, 'storage_failed')
  }

  return NextResponse.redirect(new URL(`/dashboard/websites/${websiteId}/integrations?wix=connected`, request.url))
}

function redirectWithError(request: NextRequest, websiteId: string | null, reason: string): NextResponse {
  const target = websiteId ? `/dashboard/websites/${websiteId}/integrations` : '/dashboard'
  const url = new URL(target, request.url)
  url.searchParams.set('wix', 'error')
  url.searchParams.set('wixReason', reason)
  return NextResponse.redirect(url)
}
