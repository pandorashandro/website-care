import 'server-only'
import { stripToPlainText, type TitleIssueKind } from '@/lib/fixes/title-preview'

export type { TitleIssueKind }

/**
 * webioom's own product-policy maximum for a Shopify title proposal — NOT
 * a Shopify-imposed limit. Shopify's Admin API documents no length cap on
 * the `title` field for Product/Collection/Page/Article. This matches
 * lib/fixes/title-preview.ts's identical MAX_LENGTH exactly, for product
 * consistency across platforms — not because Shopify requires it.
 */
const WEBIOOM_TITLE_MAX_LENGTH = 60
const MIN_TARGET_LENGTH = 30

export type ShopifyTitleValidationResult = { ok: true; value: string } | { ok: false; reason: string }

/**
 * Validates a candidate Shopify title — from either the deterministic
 * generator below or a future AI proposal — before it is ever signed into
 * a preview token or written. Plain text only (HTML is rejected outright,
 * never sanitized/stripped-and-accepted), trimmed, non-empty, within
 * webioom's own length policy.
 */
export function validateShopifyTitle(raw: string): ShopifyTitleValidationResult {
  if (/[<>]/.test(raw)) {
    return { ok: false, reason: 'The proposed title could not be safely validated.' }
  }

  const value = stripToPlainText(raw)

  if (!value) {
    return { ok: false, reason: 'The proposed title is empty.' }
  }

  if (value.length > WEBIOOM_TITLE_MAX_LENGTH) {
    return { ok: false, reason: `webioom limits titles to ${WEBIOOM_TITLE_MAX_LENGTH} characters (webioom policy, not a Shopify limit).` }
  }

  return { ok: true, value }
}

export type ShopifyTitleProposalContext = {
  /** The current Shopify Admin title, if any (from a fresh resolveShopifyResource call). */
  currentTitle: string | null
  /** The resource's Shopify handle — the only source ever used for a from-scratch proposal. */
  handle: string
  /** The webioom website's own name, already ownership-verified — used only as a safe brand/context signal. */
  websiteName: string | null
}

export type ShopifyTitleProposalOutcome = { ok: true; proposedValue: string } | { ok: false; reason: string }

function capitalizeWord(word: string): string {
  return word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word
}

/** A literal transformation of the handle's own text (hyphens/underscores -> spaces, each word capitalized) — never invents words. */
function titleFromHandle(handle: string): string | null {
  const words = handle.split(/[-_]+/).filter(Boolean).map(capitalizeWord)
  const joined = words.join(' ').trim()
  return joined.length > 0 ? joined : null
}

/** Appends " | {websiteName}" only if a trusted name is available and the result still fits within policy; otherwise returns the base unchanged. */
function appendBrand(base: string, websiteName: string | null): string {
  if (!websiteName) return base
  const brand = stripToPlainText(websiteName)
  if (!brand) return base
  const withBrand = `${base} | ${brand}`
  return withBrand.length <= WEBIOOM_TITLE_MAX_LENGTH ? withBrand : base
}

/** Truncates at the last whole-word boundary within policy — never mid-word, never rephrased. Refuses rather than produce a mangled fragment. */
function shortenConservatively(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed.length <= WEBIOOM_TITLE_MAX_LENGTH) return trimmed

  const truncated = trimmed.slice(0, WEBIOOM_TITLE_MAX_LENGTH)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace < 15) return null

  return truncated.slice(0, lastSpace).trim()
}

/**
 * Deterministic, non-AI Shopify title proposal generator. Mirrors
 * lib/fixes/title-preview.ts's generateTitleProposal's exact safe
 * transformation rules (derive from handle for missing, extend/shorten
 * conservatively for too_short/too_long) — reimplemented here, not
 * imported, because that module's context shape (a WordPress resource
 * `slug`) is WordPress-specific; the text-safety logic itself is
 * identical by design, not independently invented. Every proposal is
 * built only from trusted, already-server-derived context (the current
 * Shopify title, its handle, and the ownership-verified webioom website
 * name); never fabricates business claims. Refuses (ok: false) rather
 * than guess when it cannot produce a safe result.
 */
export function generateShopifyTitleProposal(issueKind: TitleIssueKind, context: ShopifyTitleProposalContext): ShopifyTitleProposalOutcome {
  const { currentTitle, handle, websiteName } = context

  if (issueKind === 'missing') {
    const base = titleFromHandle(handle)
    if (!base) {
      return { ok: false, reason: 'No safe title could be derived from this resource.' }
    }

    const proposed = base.length < MIN_TARGET_LENGTH ? appendBrand(base, websiteName) : base
    const validated = validateShopifyTitle(proposed)

    if (!validated.ok) {
      return { ok: false, reason: 'No safe title could be derived from this resource.' }
    }

    return { ok: true, proposedValue: validated.value }
  }

  const trimmedCurrent = currentTitle ? stripToPlainText(currentTitle) : ''
  if (!trimmedCurrent) {
    return { ok: false, reason: 'The current title could not be read from Shopify.' }
  }

  if (issueKind === 'too_short') {
    const extended = appendBrand(trimmedCurrent, websiteName)

    if (extended === trimmedCurrent) {
      return { ok: false, reason: 'webioom could not safely lengthen this title without adding unverified claims.' }
    }

    const validated = validateShopifyTitle(extended)
    if (!validated.ok) {
      return { ok: false, reason: 'webioom could not safely lengthen this title without adding unverified claims.' }
    }

    return { ok: true, proposedValue: validated.value }
  }

  // too_long
  const shortened = shortenConservatively(trimmedCurrent)
  if (!shortened) {
    return { ok: false, reason: 'webioom could not safely shorten this title without losing meaning.' }
  }

  const validated = validateShopifyTitle(shortened)
  if (!validated.ok) {
    return { ok: false, reason: 'webioom could not safely shorten this title without losing meaning.' }
  }

  return { ok: true, proposedValue: validated.value }
}
