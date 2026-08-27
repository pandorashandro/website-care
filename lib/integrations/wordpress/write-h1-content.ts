import 'server-only'
import { fetchWordPressApi } from './client'
import { normalizeUrl } from '@/lib/scanner/url-utils'
import { extractRaw } from './editable-content'

export type WordPressH1ContentUpdateResult =
  | { status: 'success'; resourceId: number; permalink: string; contentRaw: string }
  | { status: 'failed'; reason: string }

/**
 * Updates ONLY the `content` field of one specific, already-confirmed
 * WordPress page or post. This is the only H1-related write in the
 * codebase, and it accepts nothing beyond `updatedContent` as the body —
 * no arbitrary field name, no generic update body. Callers (applyH1Fix /
 * rollbackH1Fix) are responsible for constructing `updatedContent` via the
 * pure lib/fixes/h1-content-transform.ts helpers and for validating the
 * semantic outcome (does the returned content contain/omit the expected H1)
 * — this function only confirms the write reached the right resource.
 *
 * Response validation deliberately does NOT require byte-for-byte equality
 * between `updatedContent` and the returned content.raw: WordPress's save
 * pipeline (kses sanitization) can legitimately reformat markup depending
 * on the connected user's capabilities, even when nothing is semantically
 * wrong. Full-content equality would be a loose/unreliable success signal;
 * callers instead check for the specific H1 text they expect.
 */
export async function updateWordPressH1Content(params: {
  websiteUrl: string
  restBase: 'pages' | 'posts'
  resourceId: number
  expectedPermalink: string
  updatedContent: string
  username: string
  applicationPassword: string
}): Promise<WordPressH1ContentUpdateResult> {
  const { websiteUrl, restBase, resourceId, expectedPermalink, updatedContent, username, applicationPassword } = params

  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return { status: 'failed', reason: 'This website does not have a valid URL on file.' }
  }

  const endpoint = `${origin}/wp-json/wp/v2/${restBase}/${resourceId}?context=edit`
  const body = JSON.stringify({ content: updatedContent })

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

  const contentRaw = extractRaw(obj.content)

  if (contentRaw === null) {
    return { status: 'failed', reason: "WordPress's response did not confirm the content update." }
  }

  return { status: 'success', resourceId: obj.id, permalink: obj.link, contentRaw }
}
