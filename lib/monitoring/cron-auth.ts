import { timingSafeEqual } from 'node:crypto'

/**
 * Sprint 2, Prompt 2/3 — STEP 14/28. Pure comparison logic for the
 * monitoring cron endpoint's authentication, extracted out of
 * app/api/monitoring/run/route.ts so it is unit-testable without
 * constructing a real NextRequest. Fails closed by construction: a missing
 * configured secret NEVER falls back to "allow" — an unconfigured
 * production environment refuses every request rather than accidentally
 * running open.
 *
 * Sprint 2, Prompt 3 security review: uses `timingSafeEqual`, exactly like
 * every other secret comparison in this codebase (Shopify/Wix/Paddle
 * webhook HMAC verification, fix-preview token signatures — see
 * lib/integrations/shopify/oauth.ts, lib/paddle/webhook-signature.ts) —
 * a plain `===` string comparison leaks how many leading characters
 * matched through response-timing differences, letting an attacker guess
 * the secret one byte at a time. The length check happens BEFORE calling
 * timingSafeEqual (which throws on mismatched buffer lengths rather than
 * returning false), so a wrong-length header still fails closed instead of
 * throwing out of this function.
 */
export function isAuthorizedBearerToken(authorizationHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!expectedSecret || !authorizationHeader) return false

  const expected = Buffer.from(`Bearer ${expectedSecret}`)
  const provided = Buffer.from(authorizationHeader)

  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
