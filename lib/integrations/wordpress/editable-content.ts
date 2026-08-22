import 'server-only'
import { fetchWordPressApi } from './client'
import { normalizeUrl } from '@/lib/scanner/url-utils'
import { mapWordPressContent, type WordPressContentMapping } from './content-mapping'

export type WordPressEditableContentResult =
  | {
      status: 'loaded'
      resourceType: 'page' | 'post'
      resourceId: number
      permalink: string
      slug: string
      publicationStatus: string | null
      title: string | null
      content: string | null
      excerpt: string | null
    }
  | { status: 'unavailable'; reason: string }
  | { status: 'stale_mapping'; reason: string }
  | { status: 'connection_error'; reason: string }

function mappingFailureToContentResult(
  mapping: Exclude<WordPressContentMapping, { status: 'mapped' }>
): WordPressEditableContentResult {
  if (mapping.status === 'connection_error') {
    return { status: 'connection_error', reason: mapping.reason }
  }
  return { status: 'unavailable', reason: mapping.reason }
}

/**
 * Prefers the editable `.raw` string from a context=edit title/content/excerpt
 * field object. Never falls back to `.rendered` and never reverse-engineers
 * editable text from rendered HTML — if `.raw` is missing or not a string,
 * the field is reported as unavailable (null) rather than guessed.
 */
function extractRaw(field: unknown): string | null {
  if (!field || typeof field !== 'object') return null
  const raw = (field as Record<string, unknown>).raw
  return typeof raw === 'string' ? raw : null
}

/**
 * Given an already-confirmed mapping, fetches the exact resource by ID via
 * GET /wp-json/wp/v2/{restBase}/{resourceId}?context=edit and re-confirms
 * its `link` still matches the mapping's permalink before trusting any of
 * its content — protecting against the resource having moved (renamed,
 * unpublished, reassigned) in the gap between mapping and this fetch.
 */
async function loadMappedResource(
  websiteUrl: string,
  mapping: Extract<WordPressContentMapping, { status: 'mapped' }>,
  username: string,
  applicationPassword: string
): Promise<WordPressEditableContentResult> {
  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return { status: 'connection_error', reason: 'This website does not have a valid URL on file.' }
  }

  const endpoint = `${origin}/wp-json/wp/v2/${mapping.restBase}/${mapping.resourceId}?context=edit`
  const result = await fetchWordPressApi(endpoint, username, applicationPassword)

  if (!result.ok || result.status < 200 || result.status >= 300) {
    return { status: 'connection_error', reason: 'WordPress could not be reached to load this resource.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.body)
  } catch {
    return { status: 'unavailable', reason: "WordPress's response could not be read." }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 'unavailable', reason: "WordPress's response could not be read." }
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj.id !== 'number' || typeof obj.link !== 'string' || typeof obj.slug !== 'string') {
    return { status: 'unavailable', reason: "WordPress's response was missing expected fields." }
  }

  const normalizedFreshLink = normalizeUrl(obj.link, obj.link)
  const normalizedMappedLink = normalizeUrl(mapping.permalink, mapping.permalink)

  if (!normalizedFreshLink || !normalizedMappedLink || normalizedFreshLink !== normalizedMappedLink) {
    return {
      status: 'stale_mapping',
      reason: 'This WordPress resource has changed since it was located. Please try again.',
    }
  }

  return {
    status: 'loaded',
    resourceType: mapping.resourceType,
    resourceId: obj.id,
    permalink: obj.link,
    slug: obj.slug,
    publicationStatus: typeof obj.status === 'string' ? obj.status : null,
    title: extractRaw(obj.title),
    content: extractRaw(obj.content),
    excerpt: extractRaw(obj.excerpt),
  }
}

/**
 * Full read-only flow for Phase 14.2B: maps the scanned URL fresh (never
 * trusts a browser-supplied resourceId/restBase — there isn't one, since
 * mapping and content loading both happen server-side in this one call),
 * then — only if mapping succeeds — fetches and validates the exact
 * editable resource. Every WordPress request here is GET. Never persists
 * anything and never modifies WordPress.
 */
export async function loadWordPressEditableContent(
  websiteUrl: string,
  pageUrl: string,
  username: string,
  applicationPassword: string
): Promise<WordPressEditableContentResult> {
  const mapping = await mapWordPressContent(websiteUrl, pageUrl, username, applicationPassword)

  if (mapping.status !== 'mapped') {
    return mappingFailureToContentResult(mapping)
  }

  return loadMappedResource(websiteUrl, mapping, username, applicationPassword)
}
