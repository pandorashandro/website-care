import 'server-only'
import { fetchWordPressApi } from './client'

export type WordPressMediaAltTextUpdateResult =
  | { status: 'success'; mediaId: number; altText: string }
  | { status: 'failed'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Updates ONLY the alt_text field of one specific, already-confirmed
 * WordPress media (attachment) resource. This is the only media write in the
 * codebase, and it accepts nothing beyond the exact mediaId and proposed alt
 * text — no title, caption, description, slug, status, or other metadata.
 *
 * Deliberately does NOT rely on the `upload_files` capability flag alone as
 * proof of authority to edit an arbitrary attachment — that flag governs
 * uploading, not editing someone else's media item. Instead, before writing
 * anything, this performs an authenticated GET .../media/{id}?context=edit
 * on the EXACT resource: WordPress's REST controller gates the edit context
 * itself behind `current_user_can('edit_post', $id)`, so a 401/403 here is
 * the real (per-resource) proof of insufficient permission, not a
 * speculative write. That same GET also re-confirms media_type and the
 * current alt_text match what the preview was based on (drift protection) —
 * so no write is even attempted against a resource that has changed since
 * Prepare Fix ran.
 */
export async function updateWordPressMediaAltText(params: {
  websiteUrl: string
  mediaId: number
  expectedCurrentAlt: string
  proposedValue: string
  username: string
  applicationPassword: string
}): Promise<WordPressMediaAltTextUpdateResult> {
  const { websiteUrl, mediaId, expectedCurrentAlt, proposedValue, username, applicationPassword } = params

  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return { status: 'failed', reason: 'This website does not have a valid URL on file.' }
  }

  const detailEndpoint = `${origin}/wp-json/wp/v2/media/${mediaId}?context=edit`
  const detailResult = await fetchWordPressApi(detailEndpoint, username, applicationPassword)

  if (!detailResult.ok) {
    if (detailResult.reason === 'https_required' || detailResult.reason === 'blocked') {
      return { status: 'failed', reason: 'This website address cannot be used for a WordPress update.' }
    }
    if (detailResult.reason === 'timeout') {
      return { status: 'failed', reason: 'The request to WordPress timed out. Please try again.' }
    }
    return { status: 'failed', reason: 'WordPress could not be reached to apply this update.' }
  }

  if (detailResult.status === 401 || detailResult.status === 403) {
    return { status: 'failed', reason: 'WordPress did not allow webioom to update this image.' }
  }

  if (detailResult.status === 404) {
    return { status: 'failed', reason: 'The WordPress resource could not be found.' }
  }

  if (detailResult.status < 200 || detailResult.status >= 300) {
    return { status: 'failed', reason: `WordPress rejected this request (status ${detailResult.status}).` }
  }

  let detailParsed: unknown
  try {
    detailParsed = JSON.parse(detailResult.body)
  } catch {
    return { status: 'failed', reason: "WordPress's response could not be read." }
  }

  if (!detailParsed || typeof detailParsed !== 'object') {
    return { status: 'failed', reason: "WordPress's response could not be read." }
  }

  const detailObj = detailParsed as Record<string, unknown>

  if (typeof detailObj.id !== 'number' || detailObj.id !== mediaId) {
    return { status: 'failed', reason: "WordPress's response did not match the expected resource." }
  }

  if (detailObj.media_type !== 'image') {
    return { status: 'failed', reason: 'This media item is no longer an image.' }
  }

  const currentAlt = typeof detailObj.alt_text === 'string' ? detailObj.alt_text : ''

  if (currentAlt !== expectedCurrentAlt) {
    return {
      status: 'failed',
      reason: 'This image’s alt text changed since the preview was created. Please prepare a new fix before applying.',
    }
  }

  const updateEndpoint = `${origin}/wp-json/wp/v2/media/${mediaId}?context=edit`
  const body = JSON.stringify({ alt_text: proposedValue })

  const updateResult = await fetchWordPressApi(updateEndpoint, username, applicationPassword, {
    method: 'POST',
    body,
  })

  if (!updateResult.ok) {
    if (updateResult.reason === 'https_required' || updateResult.reason === 'blocked') {
      return { status: 'failed', reason: 'This website address cannot be used for a WordPress update.' }
    }
    if (updateResult.reason === 'timeout') {
      return { status: 'failed', reason: 'The request to WordPress timed out. Please try again.' }
    }
    return { status: 'failed', reason: 'WordPress could not be reached to apply this update.' }
  }

  if (updateResult.status === 401 || updateResult.status === 403) {
    return { status: 'failed', reason: 'WordPress did not allow webioom to update this image.' }
  }

  if (updateResult.status === 404) {
    return { status: 'failed', reason: 'The WordPress resource could not be found.' }
  }

  if (updateResult.status < 200 || updateResult.status >= 300) {
    return { status: 'failed', reason: `WordPress rejected this update (status ${updateResult.status}).` }
  }

  let updateParsed: unknown
  try {
    updateParsed = JSON.parse(updateResult.body)
  } catch {
    return { status: 'failed', reason: "WordPress's response could not be read." }
  }

  if (!updateParsed || typeof updateParsed !== 'object') {
    return { status: 'failed', reason: "WordPress's response could not be read." }
  }

  const updateObj = updateParsed as Record<string, unknown>

  if (typeof updateObj.id !== 'number' || updateObj.id !== mediaId) {
    return { status: 'failed', reason: "WordPress's response did not match the expected resource." }
  }

  const returnedAlt = typeof updateObj.alt_text === 'string' ? updateObj.alt_text : null

  if (returnedAlt === null || normalizeForComparison(returnedAlt) !== normalizeForComparison(proposedValue)) {
    return { status: 'failed', reason: "WordPress's response did not confirm the alt text was updated." }
  }

  return { status: 'success', mediaId, altText: proposedValue }
}
