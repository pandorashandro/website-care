import 'server-only'
import { fetchWordPressApi } from './client'
import { normalizeUrl } from '@/lib/scanner/url-utils'
import { extractRaw } from './editable-content'

export type WordPressImageAltContentUpdateResult =
  | { status: 'success'; resourceId: number; permalink: string; contentRaw: string }
  | { status: 'failed'; reason: string }

/**
 * Updates ONLY the `content` field of one specific, already-confirmed
 * WordPress page or post — the write path for the gutenberg_content_alt and
 * classic_html_alt strategies. Mirrors write-h1-content.ts's structure
 * exactly (same field, same endpoint shape); kept as its own dedicated file
 * rather than reused directly so each write path stays field-specific and
 * independently auditable.
 *
 * `updatedContent` must already be the pure, targeted transformation from
 * lib/fixes/image-alt-content-transform.ts. This function only confirms the
 * write reached the right resource — semantic validation (does the returned
 * content actually show the new alt text at the expected occurrence) is the
 * caller's responsibility (applyImageAltFix), same division of labor as
 * applyH1Fix/updateWordPressH1Content.
 */
export async function updateWordPressImageAltContent(params: {
  websiteUrl: string
  restBase: 'pages' | 'posts'
  resourceId: number
  expectedPermalink: string
  updatedContent: string
  username: string
  applicationPassword: string
}): Promise<WordPressImageAltContentUpdateResult> {
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
