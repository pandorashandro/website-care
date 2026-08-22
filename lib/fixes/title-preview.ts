export type TitleIssueKind = 'missing' | 'too_short' | 'too_long'

export type TitleProposalContext = {
  /** The current WordPress title.raw, if any. */
  currentTitle: string | null
  /** The resource's WordPress slug — used as the only source for a from-scratch proposal. */
  slug: string
  /** The Website Care website's own name, already ownership-verified — used only as a safe brand/context signal. */
  websiteName: string | null
}

export type TitleProposalOutcome = { ok: true; proposedValue: string } | { ok: false; reason: string }

const MIN_TARGET_LENGTH = 30
const MAX_LENGTH = 60

function stripToPlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function capitalizeWord(word: string): string {
  return word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word
}

/** A literal transformation of the slug's own text (hyphens/underscores -> spaces, each word capitalized) — never invents words. */
function titleFromSlug(slug: string): string | null {
  const words = slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(capitalizeWord)
  const joined = words.join(' ').trim()
  return joined.length > 0 ? joined : null
}

/** Appends " | {websiteName}" only if a trusted name is available and the result still fits within budget; otherwise returns the base unchanged. */
function appendBrand(base: string, websiteName: string | null): string {
  if (!websiteName) return base
  const brand = stripToPlainText(websiteName)
  if (!brand) return base
  const withBrand = `${base} | ${brand}`
  return withBrand.length <= MAX_LENGTH ? withBrand : base
}

/** Truncates at the last whole-word boundary within budget — never mid-word, never rephrased. Refuses rather than produce a mangled fragment. */
function shortenConservatively(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed.length <= MAX_LENGTH) return trimmed

  const truncated = trimmed.slice(0, MAX_LENGTH)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace < 15) return null

  return truncated.slice(0, lastSpace).trim()
}

function isSafeFinalProposal(value: string): boolean {
  return value.length > 0 && value.length <= MAX_LENGTH && !/[<>]/.test(value)
}

/**
 * Deterministic, non-AI title proposal generator. Every proposal is built
 * only from trusted context already available server-side (the current
 * WordPress title, its slug, and — only as a safe brand/context signal —
 * the ownership-verified Website Care website name). Never fabricates
 * business claims, locations, services, or benefits; refuses (ok: false)
 * rather than guess when it cannot produce a safe result.
 */
export function generateTitleProposal(
  issueKind: TitleIssueKind,
  context: TitleProposalContext
): TitleProposalOutcome {
  const { currentTitle, slug, websiteName } = context

  if (issueKind === 'missing') {
    const base = titleFromSlug(slug)
    if (!base) {
      return { ok: false, reason: 'No safe title could be derived from this page.' }
    }

    const proposed = base.length < MIN_TARGET_LENGTH ? appendBrand(base, websiteName) : base

    if (!isSafeFinalProposal(proposed)) {
      return { ok: false, reason: 'No safe title could be derived from this page.' }
    }

    return { ok: true, proposedValue: proposed }
  }

  const trimmedCurrent = currentTitle ? stripToPlainText(currentTitle) : ''
  if (!trimmedCurrent) {
    return { ok: false, reason: 'The current title could not be read from WordPress.' }
  }

  if (issueKind === 'too_short') {
    const extended = appendBrand(trimmedCurrent, websiteName)

    if (extended === trimmedCurrent || !isSafeFinalProposal(extended)) {
      return {
        ok: false,
        reason: 'Website Care could not safely lengthen this title without adding unverified claims.',
      }
    }

    return { ok: true, proposedValue: extended }
  }

  // too_long
  const shortened = shortenConservatively(trimmedCurrent)
  if (!shortened || !isSafeFinalProposal(shortened)) {
    return {
      ok: false,
      reason: 'Website Care could not safely shorten this title without losing meaning.',
    }
  }

  return { ok: true, proposedValue: shortened }
}
