import 'server-only'
import { isBlockedHost } from '@/lib/scanner/checks'

const REQUEST_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5

export type WordPressApiFailureReason =
  | 'timeout'
  | 'network'
  | 'blocked'
  | 'cross_host_redirect'
  | 'too_many_redirects'
  | 'https_required'

export type WordPressApiResult =
  | { ok: true; status: number; body: string }
  | { ok: false; reason: WordPressApiFailureReason }

/**
 * Performs an authenticated GET request to a WordPress REST API endpoint
 * using HTTP Basic auth (username + Application Password — never the
 * account's normal password). Adapted from the scanner's fetchPage
 * redirect-following pattern (reusing the same SSRF hostname guard), with
 * one additional rule specific to carrying credentials: any redirect whose
 * target hostname differs from the request's original hostname is rejected
 * outright rather than followed — the Authorization header is only ever
 * sent to the exact host the request started on.
 */
export async function fetchWordPressApi(
  url: string,
  username: string,
  applicationPassword: string
): Promise<WordPressApiResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'network' }
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'https_required' }
  }

  const originalHostname = parsed.hostname.toLowerCase()

  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, reason: 'blocked' }
  }

  // Credentials live only in this header for the lifetime of the request —
  // never appended to the URL/query string, never logged.
  const authorizationHeader = `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    let currentUrl = parsed
    const seenUrls = new Set<string>()

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const normalizedCurrent = currentUrl.toString()

      if (seenUrls.has(normalizedCurrent)) {
        return { ok: false, reason: 'too_many_redirects' }
      }
      seenUrls.add(normalizedCurrent)

      const response = await fetch(normalizedCurrent, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Authorization: authorizationHeader,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; WebsiteCareBot/1.0)',
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) return { ok: false, reason: 'network' }

        let nextUrl: URL
        try {
          nextUrl = new URL(location, currentUrl)
        } catch {
          return { ok: false, reason: 'network' }
        }

        if (nextUrl.hostname.toLowerCase() !== originalHostname) {
          return { ok: false, reason: 'cross_host_redirect' }
        }

        if (nextUrl.protocol !== 'https:') {
          return { ok: false, reason: 'https_required' }
        }

        if (isBlockedHost(nextUrl.hostname)) {
          return { ok: false, reason: 'blocked' }
        }

        currentUrl = nextUrl
        continue
      }

      const body = await response.text()
      return { ok: true, status: response.status, body }
    }

    return { ok: false, reason: 'too_many_redirects' }
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timeout)
  }
}

export type WordPressUserInfo = {
  id: number
  displayName: string
}

export type VerifyWordPressReason =
  | 'invalid_credentials'
  | 'insufficient_access'
  | 'rest_api_unavailable'
  | 'unreachable'
  | 'https_required'
  | 'invalid_response'
  | 'blocked'
  | 'timeout'

export type VerifyWordPressResult =
  | { ok: true; user: WordPressUserInfo }
  | { ok: false; reason: VerifyWordPressReason }

/** Parses a WordPress REST API error body for its `code` field (e.g. "incorrect_password"). */
export function parseErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as { code?: unknown }
    return typeof parsed.code === 'string' ? parsed.code : ''
  } catch {
    return ''
  }
}

/**
 * The single endpoint used for both connection verification and capability
 * inspection — the minimal read-only request that confirms credentials work
 * and returns the authenticated user's own profile (including, with
 * context=edit, their capabilities map), without touching any
 * content-editing or privileged endpoint.
 */
export function usersMeEndpoint(websiteUrl: string): string {
  return `${new URL(websiteUrl).origin}/wp-json/wp/v2/users/me?context=edit`
}

/**
 * Verifies WordPress credentials by calling GET /wp-json/wp/v2/users/me
 * with context=edit — the minimal endpoint that both confirms the
 * credentials are valid and returns enough profile info (id, display name)
 * to store, without touching any content-editing or privileged endpoint.
 */
export async function verifyWordPressCredentials(
  websiteUrl: string,
  username: string,
  applicationPassword: string
): Promise<VerifyWordPressResult> {
  const result = await fetchWordPressApi(usersMeEndpoint(websiteUrl), username, applicationPassword)

  if (!result.ok) {
    switch (result.reason) {
      case 'https_required':
        return { ok: false, reason: 'https_required' }
      case 'blocked':
        return { ok: false, reason: 'blocked' }
      case 'timeout':
        return { ok: false, reason: 'timeout' }
      case 'cross_host_redirect':
      case 'too_many_redirects':
      case 'network':
      default:
        return { ok: false, reason: 'unreachable' }
    }
  }

  if (result.status === 401) {
    return { ok: false, reason: 'invalid_credentials' }
  }

  if (result.status === 403) {
    const errorCode = parseErrorCode(result.body)
    if (/incorrect_password|invalid_username|invalid_email/i.test(errorCode)) {
      return { ok: false, reason: 'invalid_credentials' }
    }
    return { ok: false, reason: 'insufficient_access' }
  }

  if (result.status === 404) {
    return { ok: false, reason: 'rest_api_unavailable' }
  }

  if (result.status < 200 || result.status >= 300) {
    return { ok: false, reason: 'unreachable' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.body)
  } catch {
    return { ok: false, reason: 'invalid_response' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'invalid_response' }
  }

  const obj = parsed as Record<string, unknown>
  const id = obj.id
  const displayName = typeof obj.name === 'string' && obj.name.trim() ? obj.name : obj.username

  if (typeof id !== 'number' || typeof displayName !== 'string' || displayName.trim().length === 0) {
    return { ok: false, reason: 'invalid_response' }
  }

  return { ok: true, user: { id, displayName: displayName.trim() } }
}
