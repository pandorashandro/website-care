import { isIP } from 'node:net'

const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5

function isPrivateIp(ip: string): boolean {
  if (ip === '::1') return true

  if (
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.')
  ) {
    return true
  }

  const octets = ip.split('.').map(Number)
  return octets.length === 4 && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
}

/**
 * Blocks obvious localhost/private-IP targets before the server fetches a
 * user-supplied or discovered URL. This is a basic SSRF guard, not full
 * protection — it does not resolve DNS to catch hostnames that resolve to
 * private IPs.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    return true
  }

  return isIP(host) ? isPrivateIp(host) : false
}

export type RedirectHop = {
  url: string
  status: number
}

export type FetchFailureReason =
  | 'timeout'
  | 'blocked'
  | 'too_many_redirects'
  | 'redirect_loop'
  | 'network'

export type FetchPageResult =
  | {
      ok: true
      html: string
      durationMs: number
      sizeBytes: number
      finalUrl: string
      finalStatus: number
      redirectChain: RedirectHop[]
      redirectCount: number
      xRobotsTag: string | null
    }
  | { ok: false; reason: FetchFailureReason }

/**
 * Fetches a page, following redirects manually (rather than via fetch's
 * built-in `redirect: 'follow'`) so every hop can be revalidated against the
 * SSRF hostname guard before it's followed — a same-host page redirecting to
 * an internal address will be rejected instead of silently followed.
 *
 * `ok: true` means a real HTTP response was obtained — including error
 * statuses like 404/403/5xx, which callers should turn into specific issues
 * rather than a generic "unreachable" one. `ok: false` is reserved for cases
 * where no valid response exists at all (timeout, network error, blocked
 * target, an unresolvable redirect chain).
 */
export async function fetchPage(
  url: string,
  options?: { method?: 'GET' | 'HEAD' }
): Promise<FetchPageResult> {
  const method = options?.method ?? 'GET'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    let currentUrl = url
    const redirectChain: RedirectHop[] = []
    const seenUrls = new Set<string>()

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let parsed: URL
      try {
        parsed = new URL(currentUrl)
      } catch {
        return { ok: false, reason: 'network' }
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: 'blocked' }
      }

      if (isBlockedHost(parsed.hostname)) {
        return { ok: false, reason: 'blocked' }
      }

      const normalizedCurrent = parsed.toString()
      if (seenUrls.has(normalizedCurrent)) {
        return { ok: false, reason: 'redirect_loop' }
      }
      seenUrls.add(normalizedCurrent)

      const response = await fetch(normalizedCurrent, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebsiteCareBot/1.0)' },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) return { ok: false, reason: 'network' }

        redirectChain.push({ url: normalizedCurrent, status: response.status })

        try {
          currentUrl = new URL(location, parsed).toString()
        } catch {
          return { ok: false, reason: 'network' }
        }

        continue
      }

      // Measured once headers arrive, before reading the body — an
      // approximation of time-to-first-byte rather than full download time.
      const durationMs = Date.now() - startedAt
      const html = await response.text()

      return {
        ok: true,
        html,
        durationMs,
        sizeBytes: new TextEncoder().encode(html).length,
        finalUrl: normalizedCurrent,
        finalStatus: response.status,
        redirectChain,
        redirectCount: redirectChain.length,
        xRobotsTag: response.headers.get('x-robots-tag'),
      }
    }

    return { ok: false, reason: 'too_many_redirects' }
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timeout)
  }
}

export function isHttps(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

/** Returns the trimmed title text, or null if there is no non-empty <title>. */
export function getTitleText(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return null

  const text = match[1].replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text : null
}

/** Returns the trimmed meta description content, or null if missing/empty. */
export function getMetaDescriptionContent(html: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []

  for (const tag of metaTags) {
    if (!/name\s*=\s*["']description["']/i.test(tag)) continue

    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)
    if (content && content[1].trim().length > 0) {
      return content[1].trim()
    }
  }

  return null
}

export function countH1(html: string): number {
  const matches = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi)
  return matches ? matches.length : 0
}

export function hasImageMissingAlt(html: string): boolean {
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? []

  return imgTags.some((tag) => {
    const alt = tag.match(/alt\s*=\s*["']([^"']*)["']/i)
    return !alt || alt[1].trim().length === 0
  })
}

/** Returns the raw href of the <link rel="canonical"> tag, or null if absent/empty. */
export function getCanonicalHref(html: string): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []

  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']canonical["']/i.test(tag)) continue

    const href = tag.match(/href\s*=\s*["']([^"']*)["']/i)
    if (href && href[1].trim().length > 0) {
      return href[1].trim()
    }
  }

  return null
}

function hasNonEmptyMetaProperty(html: string, property: string): boolean {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []
  const propertyPattern = new RegExp(`(?:property|name)\\s*=\\s*["']${property}["']`, 'i')

  return metaTags.some((tag) => {
    if (!propertyPattern.test(tag)) return false

    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)
    return !!content && content[1].trim().length > 0
  })
}

export function hasOpenGraphTitle(html: string): boolean {
  return hasNonEmptyMetaProperty(html, 'og:title')
}

export function hasOpenGraphDescription(html: string): boolean {
  return hasNonEmptyMetaProperty(html, 'og:description')
}

export function hasLangAttribute(html: string): boolean {
  const match = html.match(/<html\b[^>]*>/i)
  if (!match) return false

  return /\blang\s*=\s*["'][^"']+["']/i.test(match[0])
}

/** True if <meta name="robots" content="..."> includes "noindex". */
export function hasNoindexMetaRobots(html: string): boolean {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []

  return metaTags.some((tag) => {
    if (!/name\s*=\s*["']robots["']/i.test(tag)) return false

    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)
    return !!content && /noindex/i.test(content[1])
  })
}

/** True if the X-Robots-Tag response header value includes "noindex". */
export function hasNoindexXRobotsTag(headerValue: string | null): boolean {
  return !!headerValue && /noindex/i.test(headerValue)
}

function hasNonEmptyAriaLabel(openTag: string): boolean {
  const match = openTag.match(/aria-label\s*=\s*["']([^"']*)["']/i)
  return !!match && match[1].trim().length > 0
}

function hasMeaningfulText(innerHtml: string): boolean {
  const text = innerHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 0
}

function hasEmptyInteractiveElements(html: string, tagName: 'a' | 'button'): boolean {
  const elementPattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi')
  const openTagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'i')
  const openTagStripPattern = new RegExp(`^<${tagName}\\b[^>]*>`, 'i')
  const closeTagStripPattern = new RegExp(`<\\/${tagName}>$`, 'i')

  const elements = html.match(elementPattern) ?? []

  return elements.some((element) => {
    const openTagMatch = element.match(openTagPattern)
    const openTag = openTagMatch ? openTagMatch[0] : ''

    if (hasNonEmptyAriaLabel(openTag)) {
      return false
    }

    const innerHtml = element.replace(openTagStripPattern, '').replace(closeTagStripPattern, '')
    return !hasMeaningfulText(innerHtml)
  })
}

/** Detects <a> elements with no visible text and no aria-label. */
export function hasEmptyLinks(html: string): boolean {
  return hasEmptyInteractiveElements(html, 'a')
}

/** Detects <button> elements with no visible text and no aria-label. */
export function hasEmptyButtons(html: string): boolean {
  return hasEmptyInteractiveElements(html, 'button')
}

/** Rough estimate of visible page text, with scripts/styles/tags stripped. */
export function getVisibleTextLength(html: string): number {
  const withoutScriptsAndStyles = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  const withoutTags = withoutScriptsAndStyles.replace(/<[^>]*>/g, ' ')

  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  return decoded.replace(/\s+/g, ' ').trim().length
}

/** Extracts every href value from <a> tags in the given HTML, unresolved. */
export function extractHrefs(html: string): string[] {
  const hrefPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>/gi
  const hrefs: string[] = []

  let match: RegExpExecArray | null
  while ((match = hrefPattern.exec(html)) !== null) {
    hrefs.push(match[1])
  }

  return hrefs
}
