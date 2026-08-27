import 'server-only'
import { fetchWordPressApi } from '@/lib/integrations/wordpress/client'
import { normalizeUrl } from '@/lib/scanner/url-utils'
import { classifyH1ContentSource } from './h1-source-detection'
import type { WordPressEditableContentResult } from '@/lib/integrations/wordpress/editable-content'

export type ImageAltSource = 'media_library' | 'gutenberg_content' | 'classic_html' | 'external' | 'builder_or_custom' | 'unknown'

export type ImageAltWriteStrategy = 'media_alt_text' | 'gutenberg_content_alt' | 'classic_html_alt'

export type ImageAltSourceDetectionResult =
  | {
      status: 'supported'
      source: 'media_library' | 'gutenberg_content' | 'classic_html'
      imageUrl: string
      mediaId: number | null
      currentAlt: string
      writeStrategy: ImageAltWriteStrategy
      /** Bounded, deterministically-extracted text surrounding the exact <img> occurrence in content.raw — only ever populated for content-level sources (never media_library, since there's no content occurrence to extract around). */
      nearbyContext: string | null
      futureWritePossible: true
      reason: string
    }
  | {
      status: 'ambiguous'
      source: 'media_library' | 'gutenberg_content' | 'classic_html' | 'unknown'
      imageUrl: string
      futureWritePossible: false
      reason: string
    }
  | {
      status: 'unsupported'
      source: 'external' | 'builder_or_custom' | 'unknown'
      imageUrl: string
      futureWritePossible: false
      reason: string
    }
  | {
      status: 'connection_error'
      reason: string
    }

type ContentImageOccurrence = { hasAltAttribute: boolean; altValue: string | null; matchedTag: string }

const NEARBY_CONTEXT_WINDOW_CHARS = 400
const NEARBY_CONTEXT_MAX_CHARS = 500

/**
 * Bounded, deterministic extraction of the text immediately surrounding one
 * exact <img> occurrence in rawContent — a fixed character window before and
 * after the matched tag, tags stripped, whitespace collapsed. No DOM
 * building, no reserialization, no heuristic "find the nearest heading"
 * logic. Returns null if the tag can't be located (shouldn't happen, since
 * matchedTag always comes from a regex match against this same rawContent).
 */
function extractNearbyContext(rawContent: string, matchedTag: string): string | null {
  const index = rawContent.indexOf(matchedTag)
  if (index === -1) return null

  const before = rawContent.slice(Math.max(0, index - NEARBY_CONTEXT_WINDOW_CHARS), index)
  const after = rawContent.slice(index + matchedTag.length, index + matchedTag.length + NEARBY_CONTEXT_WINDOW_CHARS)

  const context = `${before} ${after}`
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return context.length > 0 ? context.slice(0, NEARBY_CONTEXT_MAX_CHARS) : null
}

const AMBIGUOUS_REASON =
  'Website Care found conflicting or inconclusive information about which WordPress field controls this image’s alt text, so automatic editing is disabled.'

const UNSUPPORTED_BUILDER_REASON =
  'This image appears to be controlled by a page builder, theme, or another content layer. Website Care will not modify it automatically.'

const UNSUPPORTED_EXTERNAL_REASON =
  'Website Care could not find this image in the connected WordPress site’s content or Media Library.'

const SUPPORTED_REASON = "Website Care identified this image's editable alt-text source."

/** Best-effort search term only — the size-suffix/extension are stripped purely to improve WordPress's own search recall; never used to confirm identity. */
function deriveMediaSearchTerm(normalizedImageUrl: string): string | null {
  try {
    const { pathname } = new URL(normalizedImageUrl)
    const filename = pathname.split('/').pop()
    if (!filename) return null

    const withoutSizeSuffix = filename.replace(/-\d+x\d+(?=\.[a-zA-Z0-9]+$)/, '')
    const withoutExtension = withoutSizeSuffix.replace(/\.[a-zA-Z0-9]+$/, '')
    return withoutExtension.trim() || null
  } catch {
    return null
  }
}

async function fetchMediaCandidates(
  websiteUrl: string,
  searchTerm: string,
  username: string,
  applicationPassword: string
): Promise<Record<string, unknown>[] | null> {
  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return null
  }

  const endpoint = `${origin}/wp-json/wp/v2/media?search=${encodeURIComponent(searchTerm)}&per_page=10`
  const result = await fetchWordPressApi(endpoint, username, applicationPassword)

  if (!result.ok || result.status < 200 || result.status >= 300) return null

  try {
    const parsed = JSON.parse(result.body)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
  } catch {
    return null
  }
}

/** Exact match only — against the attachment's own source_url, or any of its generated size URLs. Never a filename/partial match. */
function candidateMatchesImageUrl(candidate: Record<string, unknown>, normalizedImageUrl: string): boolean {
  const sourceUrl = candidate.source_url
  if (typeof sourceUrl === 'string' && normalizeUrl(sourceUrl, sourceUrl) === normalizedImageUrl) {
    return true
  }

  const mediaDetails = candidate.media_details
  if (!mediaDetails || typeof mediaDetails !== 'object') return false

  const sizes = (mediaDetails as Record<string, unknown>).sizes
  if (!sizes || typeof sizes !== 'object') return false

  for (const size of Object.values(sizes as Record<string, unknown>)) {
    if (!size || typeof size !== 'object') continue
    const sizeUrl = (size as Record<string, unknown>).source_url
    if (typeof sizeUrl === 'string' && normalizeUrl(sizeUrl, sizeUrl) === normalizedImageUrl) {
      return true
    }
  }

  return false
}

async function fetchMediaAltText(
  websiteUrl: string,
  mediaId: number,
  username: string,
  applicationPassword: string
): Promise<{ status: 'ok'; altText: string } | { status: 'failed' }> {
  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return { status: 'failed' }
  }

  const endpoint = `${origin}/wp-json/wp/v2/media/${mediaId}?context=edit`
  const result = await fetchWordPressApi(endpoint, username, applicationPassword)

  if (!result.ok || result.status < 200 || result.status >= 300) return { status: 'failed' }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.body)
  } catch {
    return { status: 'failed' }
  }

  if (!parsed || typeof parsed !== 'object') return { status: 'failed' }

  const obj = parsed as Record<string, unknown>
  if (obj.media_type !== 'image') return { status: 'failed' }

  return { status: 'ok', altText: typeof obj.alt_text === 'string' ? obj.alt_text : '' }
}

/**
 * Finds every `<img>` in rawContent matching either the exact normalized src
 * or (when mediaId is known) a `wp-image-{mediaId}` class — never a partial
 * filename match. Reports, per occurrence, whether an alt attribute is
 * present at all (even empty) versus fully absent — the distinction that
 * decides whether content-level markup is the authoritative alt source.
 */
function findContentImageOccurrences(
  rawContent: string,
  normalizedImageUrl: string,
  mediaId: number | null,
  resolutionBase: string
): ContentImageOccurrence[] {
  const imgTags = rawContent.match(/<img\b[^>]*>/gi) ?? []
  const occurrences: ContentImageOccurrence[] = []

  const classPattern = mediaId !== null ? new RegExp(`\\bwp-image-${mediaId}\\b`) : null

  for (const tag of imgTags) {
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i)
    const src = srcMatch ? srcMatch[1].trim() : null
    const normalizedSrc = src ? normalizeUrl(src, resolutionBase) : null
    const srcMatches = normalizedSrc !== null && normalizedSrc === normalizedImageUrl

    const classMatch = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)
    const classMatches = !!classPattern && !!classMatch && classPattern.test(classMatch[1])

    if (!srcMatches && !classMatches) continue

    const altMatch = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)
    occurrences.push({ hasAltAttribute: !!altMatch, altValue: altMatch ? altMatch[1] : null, matchedTag: tag })
  }

  return occurrences
}

/**
 * 'unknown' is logically unreachable here in practice — classifyH1ContentSource
 * only reports 'unknown' when content.raw is empty, in which case no <img>
 * occurrence could ever have been found to reach this label in the first
 * place — but it's still accepted (and conservatively labeled classic_html)
 * for type safety rather than asserting/throwing on an unreachable case.
 */
function contentSourceLabel(source: 'gutenberg' | 'classic_html' | 'builder_or_custom' | 'unknown'): 'gutenberg_content' | 'classic_html' {
  return source === 'gutenberg' ? 'gutenberg_content' : 'classic_html'
}

function writeStrategyFor(source: 'gutenberg_content' | 'classic_html' | 'media_library'): ImageAltWriteStrategy {
  if (source === 'media_library') return 'media_alt_text'
  return source === 'gutenberg_content' ? 'gutenberg_content_alt' : 'classic_html_alt'
}

/**
 * Determines whether one exact, already-persisted missing-alt image can be
 * confidently traced to an editable WordPress alt-text source. READ-ONLY:
 * issues at most one media search + one media detail GET beyond the
 * already-loaded editable resource — pure content-level matches cost zero
 * extra requests. Never guesses: any ambiguity (multiple content
 * occurrences, multiple confirmed media candidates, an occurrence with no
 * alt attribute at all) resolves to 'ambiguous' rather than a best guess.
 */
export async function detectImageAltSource(input: {
  websiteUrl: string
  imageUrl: string
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>
  username: string
  applicationPassword: string
}): Promise<ImageAltSourceDetectionResult> {
  const { websiteUrl, imageUrl, content, username, applicationPassword } = input

  const normalizedImageUrl = normalizeUrl(imageUrl, content.permalink)
  if (!normalizedImageUrl) {
    return {
      status: 'unsupported',
      source: 'unknown',
      imageUrl,
      futureWritePossible: false,
      reason: 'This is not a valid http/https image URL.',
    }
  }

  const contentSource = classifyH1ContentSource(content.content)

  if (contentSource === 'builder_or_custom') {
    return {
      status: 'unsupported',
      source: 'builder_or_custom',
      imageUrl: normalizedImageUrl,
      futureWritePossible: false,
      reason: UNSUPPORTED_BUILDER_REASON,
    }
  }

  const rawContent = content.content ?? ''

  // Stage 1: direct src match in content.raw — zero WordPress requests.
  const srcOccurrences = findContentImageOccurrences(rawContent, normalizedImageUrl, null, content.permalink)

  if (srcOccurrences.length > 1) {
    return { status: 'ambiguous', source: contentSourceLabel(contentSource), imageUrl: normalizedImageUrl, futureWritePossible: false, reason: AMBIGUOUS_REASON }
  }

  if (srcOccurrences.length === 1) {
    const occurrence = srcOccurrences[0]
    const source = contentSourceLabel(contentSource)

    if (!occurrence.hasAltAttribute) {
      // Present in content.raw but with no alt attribute at all: editing
      // Media Library alt_text would not retroactively change this
      // statically-serialized markup, so we cannot honestly call this
      // "supported" via any source.
      return { status: 'ambiguous', source, imageUrl: normalizedImageUrl, futureWritePossible: false, reason: AMBIGUOUS_REASON }
    }

    return {
      status: 'supported',
      source,
      imageUrl: normalizedImageUrl,
      mediaId: null,
      currentAlt: occurrence.altValue ?? '',
      writeStrategy: writeStrategyFor(source),
      nearbyContext: extractNearbyContext(rawContent, occurrence.matchedTag),
      futureWritePossible: true,
      reason: SUPPORTED_REASON,
    }
  }

  // Stage 2: not found directly in content.raw — try Media Library mapping.
  const searchTerm = deriveMediaSearchTerm(normalizedImageUrl)
  if (!searchTerm) {
    return {
      status: 'unsupported',
      source: 'unknown',
      imageUrl: normalizedImageUrl,
      futureWritePossible: false,
      reason: UNSUPPORTED_EXTERNAL_REASON,
    }
  }

  const candidates = await fetchMediaCandidates(websiteUrl, searchTerm, username, applicationPassword)
  if (candidates === null) {
    return { status: 'connection_error', reason: 'WordPress could not be reached to check this image.' }
  }

  const confirmedMatches = candidates.filter((candidate) => candidateMatchesImageUrl(candidate, normalizedImageUrl))

  if (confirmedMatches.length > 1) {
    return { status: 'ambiguous', source: 'media_library', imageUrl: normalizedImageUrl, futureWritePossible: false, reason: AMBIGUOUS_REASON }
  }

  if (confirmedMatches.length === 0) {
    return {
      status: 'unsupported',
      source: 'external',
      imageUrl: normalizedImageUrl,
      futureWritePossible: false,
      reason: UNSUPPORTED_EXTERNAL_REASON,
    }
  }

  const mediaIdRaw = confirmedMatches[0].id
  if (typeof mediaIdRaw !== 'number') {
    return {
      status: 'unsupported',
      source: 'unknown',
      imageUrl: normalizedImageUrl,
      futureWritePossible: false,
      reason: UNSUPPORTED_EXTERNAL_REASON,
    }
  }
  const mediaId = mediaIdRaw

  // Safety net: the image might still be embedded in content.raw via a
  // wp-image-{id} class even though its exact src didn't match (e.g. a
  // different generated size than what stage 1 checked against).
  const classOccurrences = findContentImageOccurrences(rawContent, normalizedImageUrl, mediaId, content.permalink)

  if (classOccurrences.length > 1) {
    return { status: 'ambiguous', source: contentSourceLabel(contentSource), imageUrl: normalizedImageUrl, futureWritePossible: false, reason: AMBIGUOUS_REASON }
  }

  if (classOccurrences.length === 1) {
    const occurrence = classOccurrences[0]
    const source = contentSourceLabel(contentSource)

    if (!occurrence.hasAltAttribute) {
      return { status: 'ambiguous', source, imageUrl: normalizedImageUrl, futureWritePossible: false, reason: AMBIGUOUS_REASON }
    }

    return {
      status: 'supported',
      source,
      imageUrl: normalizedImageUrl,
      mediaId,
      currentAlt: occurrence.altValue ?? '',
      writeStrategy: writeStrategyFor(source),
      nearbyContext: extractNearbyContext(rawContent, occurrence.matchedTag),
      futureWritePossible: true,
      reason: SUPPORTED_REASON,
    }
  }

  // Not embedded in content.raw at all (e.g. featured image, widget,
  // template-rendered image) — Media Library alt_text is the plausible
  // editable source. No content occurrence exists to extract context from.
  const mediaDetail = await fetchMediaAltText(websiteUrl, mediaId, username, applicationPassword)
  if (mediaDetail.status === 'failed') {
    return { status: 'connection_error', reason: 'WordPress could not be reached to load this image’s details.' }
  }

  return {
    status: 'supported',
    source: 'media_library',
    imageUrl: normalizedImageUrl,
    mediaId,
    currentAlt: mediaDetail.altText,
    writeStrategy: 'media_alt_text',
    nearbyContext: null,
    futureWritePossible: true,
    reason: SUPPORTED_REASON,
  }
}
