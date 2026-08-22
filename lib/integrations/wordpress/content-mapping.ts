import 'server-only'
import { fetchWordPressApi } from './client'
import { normalizeUrl } from '@/lib/scanner/url-utils'

export type WordPressContentMapping =
  | {
      status: 'mapped'
      resourceType: 'page' | 'post'
      resourceId: number
      restBase: 'pages' | 'posts'
      permalink: string
    }
  | { status: 'unmapped'; reason: string }
  | { status: 'connection_error'; reason: string }

type RestResource = { id: number; link: string }

/**
 * Parses a WordPress collection response into the minimal shape needed for
 * matching. Anything that doesn't look like a valid resource (missing id,
 * non-string link) is silently skipped rather than causing a crash — it
 * simply can't be considered a candidate.
 */
function parseResourceList(body: string): RestResource[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }

  if (!Array.isArray(parsed)) return null

  const resources: RestResource[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (typeof obj.id === 'number' && typeof obj.link === 'string') {
      resources.push({ id: obj.id, link: obj.link })
    }
  }

  return resources
}

/**
 * The sole confirmation step: both URLs are normalized with the existing
 * scanner normalization (trailing slash / fragment insensitive; protocol
 * and hostname always significant) and compared for exact equality — never
 * substring matching, never guessed from a slug alone.
 */
function linksMatch(candidateLink: string, targetUrl: string): boolean {
  const normalizedCandidate = normalizeUrl(candidateLink, candidateLink)
  const normalizedTarget = normalizeUrl(targetUrl, targetUrl)
  return !!normalizedCandidate && !!normalizedTarget && normalizedCandidate === normalizedTarget
}

/**
 * - 'network_error': the request itself could not be completed (timeout,
 *   network failure, blocked/cross-host redirect, non-2xx status) — we
 *   never got usable data from WordPress at all.
 * - 'malformed': a successful response was received, but its body wasn't
 *   the expected shape — WordPress was reached, its answer just can't be
 *   trusted or used.
 * These are kept distinct because "couldn't reach WordPress" should surface
 * as connection_error, while "reached it but got garbage" is closer to
 * "couldn't confirm a mapping" — i.e. unmapped.
 */
type CandidateFetch = RestResource[] | 'network_error' | 'malformed'

async function fetchCandidatesBySlug(
  origin: string,
  restBase: 'pages' | 'posts',
  slug: string,
  username: string,
  applicationPassword: string
): Promise<CandidateFetch> {
  const endpoint = `${origin}/wp-json/wp/v2/${restBase}?slug=${encodeURIComponent(slug)}&_fields=id,slug,link&per_page=20`

  const result = await fetchWordPressApi(endpoint, username, applicationPassword)
  if (!result.ok || result.status < 200 || result.status >= 300) return 'network_error'

  const resources = parseResourceList(result.body)
  return resources ?? 'malformed'
}

/** Returns the last non-empty path segment as a slug candidate, or null for the homepage. */
function getLastPathSegment(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '')
    if (!pathname) return null
    const segments = pathname.split('/').filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : null
  } catch {
    return null
  }
}

async function fetchJson(
  endpoint: string,
  username: string,
  applicationPassword: string
): Promise<Record<string, unknown> | null> {
  const result = await fetchWordPressApi(endpoint, username, applicationPassword)
  if (!result.ok || result.status < 200 || result.status >= 300) return null

  try {
    const parsed = JSON.parse(result.body)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Handles the homepage as a special case rather than guessing a page ID.
 * GET /wp-json/wp/v2/settings (still read-only) reveals whether the site is
 * configured to show a static page or the latest-posts index; if it's a
 * static page, that specific page is fetched by ID and its own `link` must
 * still confirm-match the homepage URL. Any failure along this chain
 * (settings inaccessible — common for non-admin connections — posts index,
 * or a non-matching link) returns 'unmapped' rather than assuming anything.
 */
async function mapHomepage(
  websiteUrl: string,
  username: string,
  applicationPassword: string
): Promise<WordPressContentMapping> {
  const origin = new URL(websiteUrl).origin

  const settings = await fetchJson(`${origin}/wp-json/wp/v2/settings`, username, applicationPassword)

  if (!settings) {
    return {
      status: 'unmapped',
      reason: 'The homepage configuration could not be confirmed.',
    }
  }

  if (settings.show_on_front !== 'page' || typeof settings.page_on_front !== 'number' || settings.page_on_front <= 0) {
    return {
      status: 'unmapped',
      reason: 'The homepage currently shows the latest posts rather than a single editable page.',
    }
  }

  const pageData = await fetchJson(
    `${origin}/wp-json/wp/v2/pages/${settings.page_on_front}?_fields=id,slug,link`,
    username,
    applicationPassword
  )

  if (!pageData || typeof pageData.id !== 'number' || typeof pageData.link !== 'string') {
    return {
      status: 'unmapped',
      reason: 'The homepage configuration could not be confirmed.',
    }
  }

  if (!linksMatch(pageData.link, websiteUrl)) {
    return {
      status: 'unmapped',
      reason: 'The homepage configuration could not be confirmed.',
    }
  }

  return {
    status: 'mapped',
    resourceType: 'page',
    resourceId: pageData.id,
    restBase: 'pages',
    permalink: pageData.link,
  }
}

/**
 * Maps a scanned page URL to an editable WordPress page or post. Read-only
 * throughout: only ever issues GET requests, and never returns a mapping
 * unless the resource's own `link` field, normalized, exactly matches the
 * normalized scanned URL. Any ambiguity (zero or multiple confirmed
 * matches, an inaccessible/malformed response) resolves to 'unmapped'
 * rather than a best guess.
 */
export async function mapWordPressContent(
  websiteUrl: string,
  pageUrl: string,
  username: string,
  applicationPassword: string
): Promise<WordPressContentMapping> {
  const slug = getLastPathSegment(pageUrl)

  if (!slug) {
    return mapHomepage(websiteUrl, username, applicationPassword)
  }

  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return { status: 'connection_error', reason: 'This website does not have a valid URL on file.' }
  }

  const [pageCandidates, postCandidates] = await Promise.all([
    fetchCandidatesBySlug(origin, 'pages', slug, username, applicationPassword),
    fetchCandidatesBySlug(origin, 'posts', slug, username, applicationPassword),
  ])

  const anyNetworkError = pageCandidates === 'network_error' || postCandidates === 'network_error'
  const anyMalformed = pageCandidates === 'malformed' || postCandidates === 'malformed'

  const matches: { resourceType: 'page' | 'post'; restBase: 'pages' | 'posts'; resource: RestResource }[] = []

  if (Array.isArray(pageCandidates)) {
    for (const candidate of pageCandidates) {
      if (linksMatch(candidate.link, pageUrl)) {
        matches.push({ resourceType: 'page', restBase: 'pages', resource: candidate })
      }
    }
  }

  if (Array.isArray(postCandidates)) {
    for (const candidate of postCandidates) {
      if (linksMatch(candidate.link, pageUrl)) {
        matches.push({ resourceType: 'post', restBase: 'posts', resource: candidate })
      }
    }
  }

  if (matches.length > 1) {
    return {
      status: 'unmapped',
      reason: 'Multiple WordPress resources could match this URL, so it was not mapped automatically.',
    }
  }

  if (matches.length === 1) {
    const match = matches[0]
    return {
      status: 'mapped',
      resourceType: match.resourceType,
      resourceId: match.resource.id,
      restBase: match.restBase,
      permalink: match.resource.link,
    }
  }

  // No confirmed match. A network-level failure means we can't be sure
  // there truly is no match, so say so rather than falsely claiming "not
  // found." A malformed-but-received response, by contrast, is treated as
  // "couldn't confirm a mapping" — unmapped — since WordPress was reached.
  if (anyNetworkError) {
    return { status: 'connection_error', reason: 'WordPress could not be reached to check this page.' }
  }

  if (anyMalformed) {
    return {
      status: 'unmapped',
      reason: "WordPress's response could not be used to confirm a mapping for this URL.",
    }
  }

  return { status: 'unmapped', reason: 'No matching WordPress page or post was found for this URL.' }
}
