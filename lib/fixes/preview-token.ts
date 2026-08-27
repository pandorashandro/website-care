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

// ---------------------------------------------------------------------------
// Meta-description preview tokens (Phase 15.2B)
//
// A deliberately separate token "kind" rather than a change to the title
// token above: same signing key, same HMAC-SHA256 primitive, same TTL — but
// its own version tag (META_TOKEN_VERSION) baked into the signed string, so
// a meta-description token can never be parsed as, or confused with, a
// title token (or vice versa), and nothing about the existing title
// sign/verify functions changes. No Apply action consumes this token yet
// (Phase 15.2B is read-only) — it exists so Phase 15.2C's Apply flow can
// start consuming it without prepareFix needing to change again.
// ---------------------------------------------------------------------------

const META_TOKEN_VERSION = 'meta-v1'

export type MetaDescriptionPreviewTokenPayload = {
  websiteId: string
  pageUrl: string
  issueTitle: string
  field: 'meta_description'
  provider: 'yoast' | 'rank_math'
  /** The exact provider-registered field this would write to in a future phase — never chosen by the client or the AI. */
  writeField: string
  /** '' represents a missing/empty current meta description, matching the title token's convention. */
  expectedCurrentValue: string
  proposedValue: string
  expiresAt: number
}

function canonicalMetaBody(payload: MetaDescriptionPreviewTokenPayload): string {
  return JSON.stringify([
    META_TOKEN_VERSION,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.field,
    payload.provider,
    payload.writeField,
    payload.expectedCurrentValue,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

export function signMetaDescriptionPreviewToken(
  payload: Omit<MetaDescriptionPreviewTokenPayload, 'expiresAt'>
): string {
  const full: MetaDescriptionPreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalMetaBody(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${META_TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedMetaDescriptionPreviewToken =
  | { ok: true; payload: MetaDescriptionPreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

export function verifyMetaDescriptionPreviewToken(token: string): VerifiedMetaDescriptionPreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== META_TOKEN_VERSION) {
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

  if (!Array.isArray(parsed) || parsed.length !== 10) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, websiteId, pageUrl, issueTitle, field, provider, writeField, expectedCurrentValue, proposedValue, expiresAt] =
    parsed

  if (
    version !== META_TOKEN_VERSION ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'meta_description' ||
    (provider !== 'yoast' && provider !== 'rank_math') ||
    typeof writeField !== 'string' ||
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
    payload: { websiteId, pageUrl, issueTitle, field, provider, writeField, expectedCurrentValue, proposedValue, expiresAt },
  }
}

// ---------------------------------------------------------------------------
// H1 preview tokens (Phase 15.3B)
//
// A third, deliberately separate token "kind" — same signing key, same
// HMAC-SHA256 primitive, same TTL, but its own version tag (H1_TOKEN_VERSION)
// baked into the signed string, so an H1 token can never be parsed as, or
// confused with, a title or meta-description token (or vice versa). Nothing
// about the existing title/meta sign/verify functions changes. No Apply
// action consumes this token yet — Phase 15.3B is read-only; it exists so a
// future write phase can start consuming it without prepareFix changing again.
// ---------------------------------------------------------------------------

const H1_TOKEN_VERSION = 'h1-v1'

export type H1PreviewTokenPayload = {
  websiteId: string
  pageUrl: string
  issueTitle: string
  field: 'h1'
  expectedSource: 'gutenberg' | 'classic_html'
  /** The H1 count Prepare Fix observed on both the public page and editable content at preview time (0 for missing_h1). */
  expectedH1Count: number
  proposedValue: string
  expiresAt: number
}

function canonicalH1Body(payload: H1PreviewTokenPayload): string {
  return JSON.stringify([
    H1_TOKEN_VERSION,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.field,
    payload.expectedSource,
    payload.expectedH1Count,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

export function signH1PreviewToken(payload: Omit<H1PreviewTokenPayload, 'expiresAt'>): string {
  const full: H1PreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalH1Body(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${H1_TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedH1PreviewToken =
  | { ok: true; payload: H1PreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

export function verifyH1PreviewToken(token: string): VerifiedH1PreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== H1_TOKEN_VERSION) {
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

  if (!Array.isArray(parsed) || parsed.length !== 9) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, websiteId, pageUrl, issueTitle, field, expectedSource, expectedH1Count, proposedValue, expiresAt] = parsed

  if (
    version !== H1_TOKEN_VERSION ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'h1' ||
    (expectedSource !== 'gutenberg' && expectedSource !== 'classic_html') ||
    typeof expectedH1Count !== 'number' ||
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
    payload: { websiteId, pageUrl, issueTitle, field, expectedSource, expectedH1Count, proposedValue, expiresAt },
  }
}
