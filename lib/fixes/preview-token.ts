import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

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
// H1 preview tokens (Phase 15.3B, extended in 15.3C)
//
// A third, deliberately separate token "kind" — same signing key, same
// HMAC-SHA256 primitive, same TTL, but its own version tag (H1_TOKEN_VERSION)
// baked into the signed string, so an H1 token can never be parsed as, or
// confused with, a title or meta-description token (or vice versa). Nothing
// about the existing title/meta sign/verify functions changes.
//
// Phase 15.3C added `expectedContentHash` directly to this h1-v1 payload
// rather than bumping to h1-v2: h1-v1 was created in 15.3B specifically to
// prepare for this phase's Apply action, and nothing has ever consumed it
// before now (no H1 Apply action existed until 15.3C) — there is no
// deployed/relied-upon h1-v1 consumer whose behavior this would break.
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
  /**
   * SHA-256 hex digest of the exact content.raw Prepare Fix loaded — never
   * the content itself. Lets Apply detect "public/editable H1 count is
   * still 0, but the page body changed in some other way since the
   * preview" (e.g. another editor rewrote the body), which count alone
   * cannot catch.
   */
  expectedContentHash: string
  proposedValue: string
  expiresAt: number
}

/** Shared by prepareFix (signing) and applyH1Fix (re-verifying) so both hash content.raw identically. */
export function hashContent(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
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
    payload.expectedContentHash,
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

  if (!Array.isArray(parsed) || parsed.length !== 10) {
    return { ok: false, reason: 'malformed' }
  }

  const [
    version,
    websiteId,
    pageUrl,
    issueTitle,
    field,
    expectedSource,
    expectedH1Count,
    expectedContentHash,
    proposedValue,
    expiresAt,
  ] = parsed

  if (
    version !== H1_TOKEN_VERSION ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'h1' ||
    (expectedSource !== 'gutenberg' && expectedSource !== 'classic_html') ||
    typeof expectedH1Count !== 'number' ||
    typeof expectedContentHash !== 'string' ||
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
    payload: { websiteId, pageUrl, issueTitle, field, expectedSource, expectedH1Count, expectedContentHash, proposedValue, expiresAt },
  }
}

// ---------------------------------------------------------------------------
// Image-alt preview tokens (Phase 15.4B)
//
// A fourth, deliberately separate token "kind" — same signing key, same
// HMAC-SHA256 primitive, same TTL, but its own version tag
// (IMAGE_ALT_TOKEN_VERSION) baked into the signed string, so it can never be
// parsed as, or confused with, a title/meta/H1 token (or vice versa).
// Nothing about those three sign/verify functions changes.
// ---------------------------------------------------------------------------

const IMAGE_ALT_TOKEN_VERSION = 'image-alt-v1'

export type ImageAltPreviewTokenPayload = {
  /** The trusted issues.id row this preview was derived from — re-fetched and re-validated (never trusted alone) by a future Apply, per getTrustedMissingImageAltIssue. */
  issueId: string
  websiteId: string
  pageUrl: string
  issueTitle: string
  field: 'image_alt'
  imageUrl: string
  source: 'media_library' | 'gutenberg_content' | 'classic_html'
  writeStrategy: 'media_alt_text' | 'gutenberg_content_alt' | 'classic_html_alt'
  /** A hint only, never trusted blindly — a future Apply must freshly re-map/re-confirm the media attachment rather than trusting this. */
  mediaId: number | null
  expectedCurrentAlt: string
  /** SHA-256 hex digest of content.raw at preview time (see hashContent) — primary staleness signal for content-level strategies, secondary corroboration for media_library. */
  expectedContentHash: string
  proposedValue: string
  expiresAt: number
}

function canonicalImageAltBody(payload: ImageAltPreviewTokenPayload): string {
  return JSON.stringify([
    IMAGE_ALT_TOKEN_VERSION,
    payload.issueId,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.field,
    payload.imageUrl,
    payload.source,
    payload.writeStrategy,
    payload.mediaId,
    payload.expectedCurrentAlt,
    payload.expectedContentHash,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

export function signImageAltPreviewToken(payload: Omit<ImageAltPreviewTokenPayload, 'expiresAt'>): string {
  const full: ImageAltPreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalImageAltBody(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${IMAGE_ALT_TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedImageAltPreviewToken =
  | { ok: true; payload: ImageAltPreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

export function verifyImageAltPreviewToken(token: string): VerifiedImageAltPreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== IMAGE_ALT_TOKEN_VERSION) {
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

  if (!Array.isArray(parsed) || parsed.length !== 14) {
    return { ok: false, reason: 'malformed' }
  }

  const [
    version,
    issueId,
    websiteId,
    pageUrl,
    issueTitle,
    field,
    imageUrl,
    source,
    writeStrategy,
    mediaId,
    expectedCurrentAlt,
    expectedContentHash,
    proposedValue,
    expiresAt,
  ] = parsed

  if (
    version !== IMAGE_ALT_TOKEN_VERSION ||
    typeof issueId !== 'string' ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'image_alt' ||
    typeof imageUrl !== 'string' ||
    (source !== 'media_library' && source !== 'gutenberg_content' && source !== 'classic_html') ||
    (writeStrategy !== 'media_alt_text' && writeStrategy !== 'gutenberg_content_alt' && writeStrategy !== 'classic_html_alt') ||
    (mediaId !== null && typeof mediaId !== 'number') ||
    typeof expectedCurrentAlt !== 'string' ||
    typeof expectedContentHash !== 'string' ||
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
    payload: {
      issueId,
      websiteId,
      pageUrl,
      issueTitle,
      field,
      imageUrl,
      source,
      writeStrategy,
      mediaId,
      expectedCurrentAlt,
      expectedContentHash,
      proposedValue,
      expiresAt,
    },
  }
}

// ---------------------------------------------------------------------------
// Shopify Title preview tokens (Phase 20.1D)
//
// A fifth, deliberately separate token "kind" — same signing key, same
// HMAC-SHA256 primitive, same TTL, but its own version tag
// (SHOPIFY_TITLE_TOKEN_VERSION) baked into the signed string, so it can
// never be parsed as, or confused with, a WordPress title/meta/H1/image-alt
// token (or vice versa). Nothing about those four sign/verify functions
// changes.
//
// Binds every fact Phase 20.1D's Apply-time recheck needs to detect
// substitution: the trusted issue this Prepare call started from (never a
// browser-submitted page URL/title on its own), the server-derived Shopify
// resource identity (resourceType + resourceGid, both from
// resolveShopifyResource — never client-supplied), and the exact current
// title Prepare observed (for drift detection at Apply). No Shopify
// credentials, access token, or scopes are ever included — Apply always
// re-derives those fresh from the ownership-verified connection, never
// from this token.
// ---------------------------------------------------------------------------

const SHOPIFY_TITLE_TOKEN_VERSION = 'shopify-title-v1'

export type ShopifyTitlePreviewTokenPayload = {
  /** The trusted issues.id row this preview was derived from — re-fetched and re-validated (never trusted alone) at Apply time. */
  issueId: string
  websiteId: string
  pageUrl: string
  issueTitle: string
  field: 'title'
  resourceType: 'product' | 'collection' | 'page' | 'article'
  /** The Shopify Admin GID resolveShopifyResource confirmed at Prepare time — re-resolved and compared fresh at Apply, never trusted from this token alone. */
  resourceGid: string
  /** '' represents a missing/empty current title, matching the WordPress title token's convention. */
  expectedCurrentTitle: string
  proposedValue: string
  expiresAt: number
}

function canonicalShopifyTitleBody(payload: ShopifyTitlePreviewTokenPayload): string {
  return JSON.stringify([
    SHOPIFY_TITLE_TOKEN_VERSION,
    payload.issueId,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.field,
    payload.resourceType,
    payload.resourceGid,
    payload.expectedCurrentTitle,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

export function signShopifyTitlePreviewToken(payload: Omit<ShopifyTitlePreviewTokenPayload, 'expiresAt'>): string {
  const full: ShopifyTitlePreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalShopifyTitleBody(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${SHOPIFY_TITLE_TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedShopifyTitlePreviewToken =
  | { ok: true; payload: ShopifyTitlePreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

export function verifyShopifyTitlePreviewToken(token: string): VerifiedShopifyTitlePreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== SHOPIFY_TITLE_TOKEN_VERSION) {
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

  if (!Array.isArray(parsed) || parsed.length !== 11) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, issueId, websiteId, pageUrl, issueTitle, field, resourceType, resourceGid, expectedCurrentTitle, proposedValueRaw, expiresAt] =
    parsed

  if (
    version !== SHOPIFY_TITLE_TOKEN_VERSION ||
    typeof issueId !== 'string' ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'title' ||
    (resourceType !== 'product' && resourceType !== 'collection' && resourceType !== 'page' && resourceType !== 'article') ||
    typeof resourceGid !== 'string' ||
    typeof expectedCurrentTitle !== 'string' ||
    typeof proposedValueRaw !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }

  if (Date.now() > expiresAt) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    payload: {
      issueId,
      websiteId,
      pageUrl,
      issueTitle,
      field,
      resourceType,
      resourceGid,
      expectedCurrentTitle,
      proposedValue: proposedValueRaw,
      expiresAt,
    },
  }
}

// ---------------------------------------------------------------------------
// Shopify Meta Description preview tokens (Phase 20.1E)
//
// A sixth, deliberately separate token "kind" — same signing key, same
// HMAC-SHA256 primitive, same TTL, but its own version tag
// (SHOPIFY_META_TOKEN_VERSION) baked into the signed string, so it can
// never be parsed as, or confused with, any of the five existing token
// kinds (or vice versa). Nothing about those five sign/verify functions
// changes — this section is purely additive.
//
// Deliberately does NOT carry `mechanism` ('seo_object' vs
// 'seo_metafield') or a metafield `type` — both are either deterministic
// from `resourceType` alone (mechanism) or must be re-derived fresh at
// Apply time regardless (metafield type), so storing either in the token
// would only create a second, potentially-stale source of truth for
// something Apply always recomputes anyway. See
// lib/integrations/shopify/meta-mutations.ts.
// ---------------------------------------------------------------------------

const SHOPIFY_META_TOKEN_VERSION = 'shopify-meta-v1'

export type ShopifyMetaPreviewTokenPayload = {
  /** The trusted issues.id row this preview was derived from — re-fetched and re-validated (never trusted alone) at Apply time. */
  issueId: string
  websiteId: string
  pageUrl: string
  issueTitle: string
  field: 'meta_description'
  resourceType: 'product' | 'collection' | 'page' | 'article'
  /** The Shopify Admin GID resolveShopifyResource confirmed at Prepare time — re-resolved and compared fresh at Apply, never trusted from this token alone. */
  resourceGid: string
  /** '' represents a missing/empty current meta description, matching the other preview tokens' convention. */
  expectedCurrentValue: string
  proposedValue: string
  expiresAt: number
}

function canonicalShopifyMetaBody(payload: ShopifyMetaPreviewTokenPayload): string {
  return JSON.stringify([
    SHOPIFY_META_TOKEN_VERSION,
    payload.issueId,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.field,
    payload.resourceType,
    payload.resourceGid,
    payload.expectedCurrentValue,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

export function signShopifyMetaPreviewToken(payload: Omit<ShopifyMetaPreviewTokenPayload, 'expiresAt'>): string {
  const full: ShopifyMetaPreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalShopifyMetaBody(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${SHOPIFY_META_TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedShopifyMetaPreviewToken =
  | { ok: true; payload: ShopifyMetaPreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

export function verifyShopifyMetaPreviewToken(token: string): VerifiedShopifyMetaPreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== SHOPIFY_META_TOKEN_VERSION) {
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

  if (!Array.isArray(parsed) || parsed.length !== 11) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, issueId, websiteId, pageUrl, issueTitle, field, resourceType, resourceGid, expectedCurrentValue, proposedValueRaw, expiresAt] =
    parsed

  if (
    version !== SHOPIFY_META_TOKEN_VERSION ||
    typeof issueId !== 'string' ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'meta_description' ||
    (resourceType !== 'product' && resourceType !== 'collection' && resourceType !== 'page' && resourceType !== 'article') ||
    typeof resourceGid !== 'string' ||
    typeof expectedCurrentValue !== 'string' ||
    typeof proposedValueRaw !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }

  if (Date.now() > expiresAt) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    payload: {
      issueId,
      websiteId,
      pageUrl,
      issueTitle,
      field,
      resourceType,
      resourceGid,
      expectedCurrentValue,
      proposedValue: proposedValueRaw,
      expiresAt,
    },
  }
}

// ---------------------------------------------------------------------------
// Wix Title preview tokens (Wix V1 Prompt 2)
//
// A seventh, deliberately separate token "kind" — same signing key, same
// HMAC-SHA256 primitive, same TTL, but its own version tag
// (WIX_TITLE_TOKEN_VERSION) baked into the signed string, so it can never
// be parsed as, or confused with, any of the six existing token kinds (or
// vice versa). Nothing about those six sign/verify functions changes.
//
// Binds every fact Apply-time rechecking needs to detect substitution: the
// trusted issue this Prepare call started from, the server-derived Wix
// resource identity (itemType + itemId, both from resolveWixResource —
// never client-supplied), and the exact current title Prepare observed
// (for drift detection at Apply). No Wix access token, instanceId, app
// secret, or the item's full tag array is ever included — Apply always
// re-derives those fresh, never from this token.
// ---------------------------------------------------------------------------

const WIX_TITLE_TOKEN_VERSION = 'wix-title-v1'

export type WixTitlePreviewTokenPayload = {
  /** The trusted issues.id row this preview was derived from — re-fetched and re-validated (never trusted alone) at Apply time. */
  issueId: string
  websiteId: string
  pageUrl: string
  issueTitle: string
  field: 'title'
  itemType: 'blog_post' | 'stores_product'
  /** The Wix item GUID resolveWixResource confirmed at Prepare time — re-resolved and compared fresh at Apply, never trusted from this token alone. */
  itemId: string
  /** '' represents a missing/empty current title, matching the Shopify/WordPress title token convention. */
  expectedCurrentTitle: string
  proposedValue: string
  expiresAt: number
}

function canonicalWixTitleBody(payload: WixTitlePreviewTokenPayload): string {
  return JSON.stringify([
    WIX_TITLE_TOKEN_VERSION,
    payload.issueId,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.field,
    payload.itemType,
    payload.itemId,
    payload.expectedCurrentTitle,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

export function signWixTitlePreviewToken(payload: Omit<WixTitlePreviewTokenPayload, 'expiresAt'>): string {
  const full: WixTitlePreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalWixTitleBody(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${WIX_TITLE_TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedWixTitlePreviewToken =
  | { ok: true; payload: WixTitlePreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

export function verifyWixTitlePreviewToken(token: string): VerifiedWixTitlePreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== WIX_TITLE_TOKEN_VERSION) {
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

  if (!Array.isArray(parsed) || parsed.length !== 11) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, issueId, websiteId, pageUrl, issueTitle, field, itemType, itemId, expectedCurrentTitle, proposedValueRaw, expiresAt] = parsed

  if (
    version !== WIX_TITLE_TOKEN_VERSION ||
    typeof issueId !== 'string' ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'title' ||
    (itemType !== 'blog_post' && itemType !== 'stores_product') ||
    typeof itemId !== 'string' ||
    typeof expectedCurrentTitle !== 'string' ||
    typeof proposedValueRaw !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }

  if (Date.now() > expiresAt) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    payload: {
      issueId,
      websiteId,
      pageUrl,
      issueTitle,
      field,
      itemType,
      itemId,
      expectedCurrentTitle,
      proposedValue: proposedValueRaw,
      expiresAt,
    },
  }
}

// ---------------------------------------------------------------------------
// Wix Meta Description preview tokens (Wix V1 Prompt 2)
//
// An eighth, deliberately separate token "kind" — same signing key, same
// HMAC-SHA256 primitive, same TTL, but its own version tag
// (WIX_META_TOKEN_VERSION) baked into the signed string. Structurally
// identical to the Wix title token above except for `field` and the
// current-value field name, mirroring the Shopify title/meta token pair's
// own precedent of two near-identical but separately-versioned kinds.
// ---------------------------------------------------------------------------

const WIX_META_TOKEN_VERSION = 'wix-meta-v1'

export type WixMetaPreviewTokenPayload = {
  issueId: string
  websiteId: string
  pageUrl: string
  issueTitle: string
  field: 'meta_description'
  itemType: 'blog_post' | 'stores_product'
  itemId: string
  expectedCurrentValue: string
  proposedValue: string
  expiresAt: number
}

function canonicalWixMetaBody(payload: WixMetaPreviewTokenPayload): string {
  return JSON.stringify([
    WIX_META_TOKEN_VERSION,
    payload.issueId,
    payload.websiteId,
    payload.pageUrl,
    payload.issueTitle,
    payload.field,
    payload.itemType,
    payload.itemId,
    payload.expectedCurrentValue,
    payload.proposedValue,
    payload.expiresAt,
  ])
}

export function signWixMetaPreviewToken(payload: Omit<WixMetaPreviewTokenPayload, 'expiresAt'>): string {
  const full: WixMetaPreviewTokenPayload = { ...payload, expiresAt: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(canonicalWixMetaBody(full), 'utf8').toString('base64url')
  const signature = createHmac('sha256', getSigningKey()).update(body).digest('base64url')
  return `${WIX_META_TOKEN_VERSION}.${body}.${signature}`
}

export type VerifiedWixMetaPreviewToken =
  | { ok: true; payload: WixMetaPreviewTokenPayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

export function verifyWixMetaPreviewToken(token: string): VerifiedWixMetaPreviewToken {
  const parts = token.split('.')

  if (parts.length !== 3 || parts[0] !== WIX_META_TOKEN_VERSION) {
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

  if (!Array.isArray(parsed) || parsed.length !== 11) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, issueId, websiteId, pageUrl, issueTitle, field, itemType, itemId, expectedCurrentValue, proposedValueRaw, expiresAt] = parsed

  if (
    version !== WIX_META_TOKEN_VERSION ||
    typeof issueId !== 'string' ||
    typeof websiteId !== 'string' ||
    typeof pageUrl !== 'string' ||
    typeof issueTitle !== 'string' ||
    field !== 'meta_description' ||
    (itemType !== 'blog_post' && itemType !== 'stores_product') ||
    typeof itemId !== 'string' ||
    typeof expectedCurrentValue !== 'string' ||
    typeof proposedValueRaw !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }

  if (Date.now() > expiresAt) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    payload: {
      issueId,
      websiteId,
      pageUrl,
      issueTitle,
      field,
      itemType,
      itemId,
      expectedCurrentValue,
      proposedValue: proposedValueRaw,
      expiresAt,
    },
  }
}
