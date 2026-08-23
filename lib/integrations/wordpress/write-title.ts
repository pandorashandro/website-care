import 'server-only'
import { fetchWordPressApi } from './client'
import { extractRaw } from './editable-content'
import { normalizeUrl } from '@/lib/scanner/url-utils'
import { stripToPlainText } from '@/lib/fixes/title-preview'

export type WordPressTitleUpdateResult =
  | { status: 'success'; resourceId: number; title: string; permalink: string }
  | { status: 'failed'; reason: string }

/**
 * Updates ONLY the title field of one specific, already-confirmed WordPress
 * page or post. This is the only place in the codebase that ever issues a
 * non-GET WordPress request, and it only ever writes `title` — no other
 * field, no arbitrary path. `restBase`/`resourceId`/`expectedPermalink` must
 * already be server-confirmed by the caller (see applyFix); this function
 * does not accept or trust anything from the browser.
 *
 * Uses the standard WordPress REST API update convention: POST to the
 * resource's own endpoint (not PUT/PATCH — WordPress core does not support
 * those for this purpose). ?context=edit on the response lets the result be
 * validated against title.raw rather than the rendered/escaped HTML title.
 */
export async function updateWordPressTitle(
  websiteUrl: string,
  restBase: 'pages' | 'posts',
  resourceId: number,
  expectedPermalink: string,
  title: string,
  username: string,
  applicationPassword: string
): Promise<WordPressTitleUpdateResult> {
  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return { status: 'failed', reason: 'This website does not have a valid URL on file.' }
  }

  const endpoint = `${origin}/wp-json/wp/v2/${restBase}/${resourceId}?context=edit`
  const body = JSON.stringify({ title })

  const result = await fetchWordPressApi(endpoint, username, applicationPassword, {
    method: 'POST',
    body,
  })

  if (!result.ok) {
    if (result.reason === 'https_required' || result.reason === 'blocked') {
      return { status: 'failed', reason: 'This website address cannot be used for a WordPress update.' }
    }
    if (result.reason === 'timeout') {
      return { status: 'failed', reason: 'The request to WordPress timed out. Please try again.' }
    }
    return { status: 'failed', reason: 'WordPress could not be reached to apply this update.' }
  }

  if (result.status === 401 || result.status === 403) {
    return { status: 'failed', reason: 'WordPress rejected this update (access denied).' }
  }

  if (result.status === 404) {
    return { status: 'failed', reason: 'The WordPress resource could not be found.' }
  }

  if (result.status < 200 || result.status >= 300) {
    return { status: 'failed', reason: `WordPress rejected this update (status ${result.status}).` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.body)
  } catch {
    return { status: 'failed', reason: "WordPress's response could not be read." }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 'failed', reason: "WordPress's response could not be read." }
  }

  const obj = parsed as Record<string, unknown>

  // Do not treat any 2xx as automatically valid — confirm the response
  // actually describes the resource and update we expect.
  if (typeof obj.id !== 'number' || obj.id !== resourceId) {
    return { status: 'failed', reason: "WordPress's response did not match the expected resource." }
  }

  if (typeof obj.link !== 'string') {
    return { status: 'failed', reason: "WordPress's response was missing expected fields." }
  }

  const normalizedReturnedLink = normalizeUrl(obj.link, obj.link)
  const normalizedExpectedLink = normalizeUrl(expectedPermalink, expectedPermalink)

  if (!normalizedReturnedLink || !normalizedExpectedLink || normalizedReturnedLink !== normalizedExpectedLink) {
    return { status: 'failed', reason: "WordPress's response did not correspond to the expected page." }
  }

  const returnedTitleRaw = extractRaw(obj.title)
  if (returnedTitleRaw !== null && stripToPlainText(returnedTitleRaw) !== stripToPlainText(title)) {
    return { status: 'failed', reason: "WordPress's response did not confirm the title was updated." }
  }

  return { status: 'success', resourceId: obj.id, title, permalink: obj.link }
}
