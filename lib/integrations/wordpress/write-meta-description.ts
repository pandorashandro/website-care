import 'server-only'
import { fetchWordPressApi } from './client'
import { normalizeUrl } from '@/lib/scanner/url-utils'
import { YOAST_META_FIELD, RANK_MATH_META_FIELD } from './seo-provider'

export type WordPressMetaDescriptionUpdateResult =
  | { status: 'success'; resourceId: number; metaDescription: string; permalink: string }
  | { status: 'failed'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Updates ONLY the meta-description field of one specific, already-confirmed
 * WordPress page or post, for exactly the two supported providers. The
 * WordPress meta key is derived purely from `provider` — a 2-way switch over
 * a type-constrained `'yoast' | 'rank_math'` value — never accepted as a
 * parameter, so this can never be turned into a generic meta writer. AIOSEO
 * and any other provider are not representable here at all.
 *
 * Uses the same standard WordPress REST update convention as
 * updateWordPressTitle: POST to the resource's own endpoint with
 * ?context=edit, validating id/link/the specific meta field in the response
 * before ever reporting success.
 */
export async function updateWordPressMetaDescription(params: {
  websiteUrl: string
  restBase: 'pages' | 'posts'
  resourceId: number
  expectedPermalink: string
  provider: 'yoast' | 'rank_math'
  metaDescription: string
  username: string
  applicationPassword: string
}): Promise<WordPressMetaDescriptionUpdateResult> {
  const { websiteUrl, restBase, resourceId, expectedPermalink, provider, metaDescription, username, applicationPassword } =
    params

  const metaField = provider === 'yoast' ? YOAST_META_FIELD : RANK_MATH_META_FIELD

  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return { status: 'failed', reason: 'This website does not have a valid URL on file.' }
  }

  const endpoint = `${origin}/wp-json/wp/v2/${restBase}/${resourceId}?context=edit`
  const body = JSON.stringify({ meta: { [metaField]: metaDescription } })

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

  const metaObj = obj.meta && typeof obj.meta === 'object' && !Array.isArray(obj.meta) ? (obj.meta as Record<string, unknown>) : null
  const returnedValue = metaObj ? metaObj[metaField] : undefined

  if (typeof returnedValue !== 'string') {
    return { status: 'failed', reason: "WordPress's response did not confirm the meta description field." }
  }

  if (normalizeForComparison(returnedValue) !== normalizeForComparison(metaDescription)) {
    return { status: 'failed', reason: "WordPress's response did not confirm the meta description was updated." }
  }

  return { status: 'success', resourceId: obj.id, metaDescription, permalink: obj.link }
}
