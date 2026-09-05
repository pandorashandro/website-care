import 'server-only'
import { NextResponse } from 'next/server'

/**
 * Wix's App Instance Removed webhook target — NOT YET FULLY IMPLEMENTED.
 * See docs/wix-api-research.md §4 and the Prompt 1 final report's
 * "remaining limitations" section for why.
 *
 * Wix webhooks (distinct from the External Install Flow's `signedInstance`
 * — see lib/integrations/wix/install.ts) are delivered as a JWT signed
 * with an asymmetric keypair, verified against a PUBLIC KEY obtained from
 * the app dashboard's Webhooks page — a different mechanism entirely from
 * `signedInstance`'s shared-secret HMAC. Implementing this safely requires
 * two real decisions this phase deliberately does not make silently:
 *
 * 1. The app's actual public key, issued only once webioom's Wix app is
 *    registered for real in the Wix dashboard — there is no meaningful
 *    placeholder value to test against.
 * 2. Which JWT verification approach to depend on (a JWT library, vs. a
 *    hand-rolled RS256 verifier via node:crypto, matching this codebase's
 *    established "no unnecessary dependency" convention for Shopify's
 *    HMAC — TBD once the exact algorithm is confirmed from a real
 *    delivered webhook).
 *
 * Until both are resolved, this handler deliberately performs NO
 * disconnect/delete action of any kind — accepting an unverified webhook
 * payload as authorization to delete a wix_connections row would let
 * anyone who can guess this URL force-disconnect an arbitrary
 * website's Wix connection. Fail-closed here means "do nothing," not
 * "silently trust the payload."
 */
export async function POST() {
  return new NextResponse(null, { status: 501 })
}
