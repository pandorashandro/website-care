import 'server-only'
import { stripToPlainText, type TitleIssueKind } from '@/lib/fixes/title-preview'

export type { TitleIssueKind }

/**
 * webioom's own product-policy maximum for a Wix title proposal — NOT a
 * Wix-imposed limit. The Item SEO Tags API documents no length cap on a
 * `title` tag's `children` field. Matches lib/fixes/title-preview.ts's and
 * lib/integrations/shopify/title-proposal.ts's identical MAX_LENGTH
 * exactly, for cross-platform product consistency — not because Wix
 * requires it (see this phase's brief: "Do not invent Wix hard limits
 * unless official docs prove them").
 */
const WEBIOOM_TITLE_MAX_LENGTH = 60
const MIN_TARGET_LENGTH = 30

export type WixTitleValidationResult = { ok: true; value: string } | { ok: false; reason: string }

/**
 * Validates a candidate Wix title — from either the deterministic
 * generator below or an AI proposal — before it is ever signed into a
 * preview token or written. Plain text only (HTML is rejected outright,
 * never sanitized/stripped-and-accepted), trimmed, non-empty, within
 * webioom's own length policy. Mirrors validateShopifyTitle exactly.
 */
export function validateWixTitle(raw: string): WixTitleValidationResult {
  if (/[<>]/.test(raw)) {
    return { ok: false, reason: 'The proposed title could not be safely validated.' }
  }

  const value = stripToPlainText(raw)

  if (!value) {
    return { ok: false, reason: 'The proposed title is empty.' }
  }

  if (value.length > WEBIOOM_TITLE_MAX_LENGTH) {
    return { ok: false, reason: `webioom limits titles to ${WEBIOOM_TITLE_MAX_LENGTH} characters (webioom policy, not a Wix limit).` }
  }

  return { ok: true, value }
}

export type WixTitleProposalContext = {
  /** The current resolved (rendered) Wix title, if any — from a fresh readWixItemSeoTags call. */
  currentTitle: string | null
  /** The resource's Wix slug — the only source ever used for a from-scratch proposal, mirroring Shopify's use of `handle`. */
  slug: string
  /** The webioom website's own name, already ownership-verified — used only as a safe brand/context signal. */
  websiteName: string | null
}

export type WixTitleProposalOutcome = { ok: true; proposedValue: string } | { ok: false; reason: string }

function capitalizeWord(word: string): string {
  return word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word
}

/** A literal transformation of the slug's own text (hyphens/underscores -> spaces, each word capitalized) — never invents words. */
function titleFromSlug(slug: string): string | null {
  const words = slug.split(/[-_]+/).filter(Boolean).map(capitalizeWord)
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
 * Deterministic, non-AI Wix title proposal generator. Mirrors
 * lib/integrations/shopify/title-proposal.ts's generateShopifyTitleProposal
 * exactly (same safe transformation rules, reimplemented here rather than
 * imported since the context shape is platform-specific). Every proposal
 * is built only from trusted, already-server-derived context; never
 * fabricates business claims. Refuses (ok: false) rather than guess when
 * it cannot produce a safe result.
 */
export function generateWixTitleProposal(issueKind: TitleIssueKind, context: WixTitleProposalContext): WixTitleProposalOutcome {
  const { currentTitle, slug, websiteName } = context

  if (issueKind === 'missing') {
    const base = titleFromSlug(slug)
    if (!base) {
      return { ok: false, reason: 'No safe title could be derived from this resource.' }
    }

    const proposed = base.length < MIN_TARGET_LENGTH ? appendBrand(base, websiteName) : base
    const validated = validateWixTitle(proposed)

    if (!validated.ok) {
      return { ok: false, reason: 'No safe title could be derived from this resource.' }
    }

    return { ok: true, proposedValue: validated.value }
  }

  const trimmedCurrent = currentTitle ? stripToPlainText(currentTitle) : ''
  if (!trimmedCurrent) {
    return { ok: false, reason: 'The current title could not be read from Wix.' }
  }

  if (issueKind === 'too_short') {
    const extended = appendBrand(trimmedCurrent, websiteName)

    if (extended === trimmedCurrent) {
      return { ok: false, reason: 'webioom could not safely lengthen this title without adding unverified claims.' }
    }

    const validated = validateWixTitle(extended)
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

  const validated = validateWixTitle(shortened)
  if (!validated.ok) {
    return { ok: false, reason: 'webioom could not safely shorten this title without losing meaning.' }
  }

  return { ok: true, proposedValue: validated.value }
}
