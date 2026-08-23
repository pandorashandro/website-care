import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_VERSION = 'v1'
const TOKEN_TTL_MS = 10 * 60 * 1000 // 10 minutes — long enough to review a preview, short enough to bound staleness exposure

export type PreviewTokenPayload = {
  websiteId: string
  pageUrl: string
  issueTitle: string
  /** '' represents a missing/null current title, matching the rest of the fix pipeline's convention. */
  expectedCurrentValue: string
  proposedValue: string
  expiresAt: number
}

/**
 * Reads and validates FIX_PREVIEW_SIGNING_KEY. Deliberately separate from
 * WORDPRESS_CREDENTIAL_ENCRYPTION_KEY — reusing that key would mean a
 * credential-encryption compromise could also forge fix-approval tokens
 * (and vice versa). Never logged; callers only ever see a generic Error.
 */
function getSigningKey(): Buffer {
  const rawKey = process.env.FIX_PREVIEW_SIGNING_KEY

  if (!rawKey) {
    throw new Error('FIX_PREVIEW_SIGNING_KEY is not configured.')
  }

  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error('FIX_PREVIEW_SIGNING_KEY must be a 64-character hex string.')
  }

  return Buffer.from(rawKey, 'hex')
}

function canonicalBody(payload: PreviewTokenPayload): string {
  return JSON.stringify([
    TOKEN_VERSION,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.expectedCurrentValue,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

/**
 * Signs a tamper-evident record of exactly what was previewed and approved
 * — website, page, issue identity, the current value the preview was based
 * on, and the exact proposed value shown to the user — so Apply Fix never
 * has to re-derive or trust a client-submitted proposed title. Throws if
 * FIX_PREVIEW_SIGNING_KEY is missing/malformed; callers (prepareFix) must
 * treat that as "fix preview unavailable" rather than let it crash the
 * request.
 */
export function signPreviewToken(payload: Omit<PreviewTokenPayload, 'expiresAt'>): string {
  const full: PreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalBody(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedPreviewToken =
  | { ok: true; payload: PreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

/**
 * Verifies signature (timing-safe comparison) and expiry before returning
 * the payload. A tampered token — any changed byte in the base64url body —
 * fails signature verification outright, so nothing downstream ever needs
 * to trust an unverified field individually.
 */
export function verifyPreviewToken(token: string): VerifiedPreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return { ok: false, reason: 'malformed' }
  }

  const [, body, signature] = parts

  let expectedSignature: string
  try {
    expectedSignature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  let signatureBuf: Buffer
  let expectedBuf: Buffer
  try {
    signatureBuf = Buffer.from(signature, 'base64url')
    expectedBuf = Buffer.from(expectedSignature, 'base64url')
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!Array.isArray(parsed) || parsed.length !== 7) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, websiteId, pageUrl, issueTitle, expectedCurrentValue, proposedValue, expiresAt] = parsed

  if (
    version !== TOKEN_VERSION ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    typeof expectedCurrentValue !== 'string' ||
    typeof proposedValue !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }

  if (Date.now() > expiresAt) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    payload: { websiteId, pageUrl, issueTitle, expectedCurrentValue, proposedValue, expiresAt },
  }
}
