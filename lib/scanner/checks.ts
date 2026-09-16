import { isIP } from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'

const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5
// Phase 25A: a hard cap on DECOMPRESSED response bytes, enforced by reading
// response.body as a stream rather than response.text() — the Fetch API
// yields decompressed bytes from that stream regardless of the response's
// Content-Encoding, so this directly bounds decompression-bomb amplification
// (a tiny compressed payload expanding to gigabytes), not just raw transfer
// size. 15 MiB is far above any legitimate page (the existing `large_html`
// scanner issue already flags anything over 1 MiB as noteworthy) and far
// below what could meaningfully exhaust a serverless function's memory.
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = octets

  if (a === 127 || a === 10 || a === 0) return true // loopback, RFC1918, "this network"
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 169 && b === 254) return true // link-local, INCLUDING cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT (RFC6598)
  if (a === 192 && b === 0 && octets[2] === 0) return true // IETF protocol assignments (some cloud metadata proxies)
  if (a === 192 && b === 0 && octets[2] === 2) return true // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking (RFC2544)
  if (a === 198 && b === 51 && octets[2] === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast (224-239) + reserved (240-255)

  return false
}

/**
 * Deliberately name/prefix-based rather than full numeric CIDR arithmetic —
 * covers every IPv6 range that actually matters for SSRF purposes
 * (loopback, unspecified, link-local incl. IPv6 cloud-metadata addressing,
 * unique-local/ULA, multicast, and IPv4-mapped addresses unwrapped back
 * through isPrivateIpv4) without the complexity of a general CIDR library.
 */
function isPrivateIpv6(ip: string): boolean {
  const address = ip.toLowerCase()

  if (address === '::1' || address === '::') return true // loopback / unspecified

  const mappedV4 = address.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mappedV4) return isPrivateIpv4(mappedV4[1])

  const firstHextet = parseInt(address.split(':').find((part) => part.length > 0) ?? '', 16)
  if (Number.isNaN(firstHextet)) return false

  if ((firstHextet & 0xffc0) === 0xfe80) return true // link-local (fe80::/10)
  if ((firstHextet & 0xfe00) === 0xfc00) return true // unique local / ULA (fc00::/7)
  if ((firstHextet & 0xff00) === 0xff00) return true // multicast (ff00::/8)

  return false
}

function isPrivateIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPrivateIpv4(ip)
  if (family === 6) return isPrivateIpv6(ip)
  return false
}

/**
 * Blocks obvious localhost/private-IP-literal targets before the server
 * even attempts DNS resolution. This is the fast, synchronous first check —
 * see resolvesToBlockedAddress below for the deeper, DNS-resolving check
 * that also catches a HOSTNAME that merely resolves to one of these ranges.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    return true
  }

  return isIP(host) ? isPrivateIp(host) : false
}

export type HostResolutionCheck = 'ok' | 'blocked' | 'unresolvable'

/**
 * Phase 25A — resolves `hostname` via DNS and validates EVERY returned
 * address (not just the first) against the same private/reserved-range
 * checks isBlockedHost applies to literal IPs. This closes the gap
 * isBlockedHost's own doc comment has always disclosed: a hostname that
 * merely *resolves* to a private/internal/cloud-metadata address (rather
 * than being a private-IP literal itself) was previously followed
 * unchecked. Called on every hop of fetchPage's redirect loop, exactly
 * like the literal-IP check, so a same-host page redirecting through a
 * hostname that resolves internally is rejected too.
 *
 * KNOWN, DELIBERATE LIMITATION (DNS rebinding): this checks the resolution
 * result at the moment of the check, then fetchPage's own subsequent
 * fetch() call performs its own, independent DNS resolution when it
 * actually opens the connection. A narrow TOCTOU window exists between
 * these two resolutions during which an attacker controlling DNS with a
 * very low TTL could theoretically return a public IP for this check and a
 * private one for the real connection ("DNS rebinding"). Closing this
 * window completely would require pinning the exact resolved IP used here
 * to the actual socket connection (e.g. via a custom `lookup`/dispatcher
 * passed into the HTTP client) — undici is not an installed/importable
 * dependency in this project (confirmed: `require.resolve('undici')` and
 * `node:undici` both fail on the Node version this runs on), and Node's
 * global `fetch` provides no supported hook to override or pin DNS
 * resolution per-request without it. Rewriting this shared primitive onto
 * Node's low-level `http`/`https` modules (which DO support a custom
 * `lookup`) would fully close this gap but was judged higher-risk than
 * beneficial for THIS phase: it is shared by every WordPress/Shopify/Wix
 * verifier and the scanner itself, and re-implementing redirect/timeout/
 * decompression handling by hand risks a much larger regression surface
 * than the residual risk being closed. This is a deliberate, documented
 * compromise, not an oversight — revisit with a proper HTTP client
 * migration if/when DNS rebinding is judged to need full closure.
 */
export async function resolvesToBlockedAddress(hostname: string): Promise<HostResolutionCheck> {
  if (isIP(hostname)) {
    // Already a literal IP — isBlockedHost's synchronous check already
    // covers this exact value; nothing further to resolve.
    return isPrivateIp(hostname) ? 'blocked' : 'ok'
  }

  try {
    const results = await dnsLookup(hostname, { all: true, verbatim: true })
    if (results.length === 0) return 'unresolvable'
    return results.some((entry) => isPrivateIp(entry.address)) ? 'blocked' : 'ok'
  } catch {
    return 'unresolvable'
  }
}

/**
 * Reads a Response body as a stream, capping DECOMPRESSED byte count at
 * `maxBytes` — see MAX_RESPONSE_BYTES's own comment for why this is the
 * correct place to guard against decompression bombs and oversized
 * responses alike. Cancels the underlying stream (closing the connection)
 * the moment the cap is exceeded, rather than reading to completion first.
 */
async function readBodyWithCap(response: Response, maxBytes: number): Promise<{ ok: true; text: string; byteLength: number } | { ok: false }> {
  const reader = response.body?.getReader()

  if (!reader) {
    const text = await response.text()
    const byteLength = new TextEncoder().encode(text).length
    return byteLength > maxBytes ? { ok: false } : { ok: true, text, byteLength }
  }

  const decoder = new TextDecoder()
  let result = ''
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return { ok: false }
    }

    result += decoder.decode(value, { stream: true })
  }

  result += decoder.decode()
  return { ok: true, text: result, byteLength: total }
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
      /** Phase 25A: the raw Content-Type response header, if any — additive field, used by the crawler to distinguish HTML pages from other resource types it may still legitimately fetch (e.g. a non-HTML URL that reached fetchPage despite isCrawlablePageUrl's extension filtering, such as an extensionless PDF). */
      contentType: string | null
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

      // Phase 20.1G: reject userinfo-bearing URLs (https://user:pass@host/...)
      // outright, on every hop including redirect targets. No legitimate
      // scanned/verified page URL is ever expected to carry credentials —
      // this closes a class of SSRF-adjacent request-smuggling/credential-
      // leak footguns some HTTP clients mishandle, at zero cost to any real
      // WordPress or Shopify verification target.
      if (parsed.username || parsed.password) {
        return { ok: false, reason: 'blocked' }
      }

      if (isBlockedHost(parsed.hostname)) {
        return { ok: false, reason: 'blocked' }
      }

      // Phase 25A: deeper DNS-resolving check — see resolvesToBlockedAddress's
      // own doc comment for exactly what this does and does not close.
      const hostResolution = await resolvesToBlockedAddress(parsed.hostname)
      if (hostResolution === 'blocked') return { ok: false, reason: 'blocked' }
      if (hostResolution === 'unresolvable') return { ok: false, reason: 'network' }

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

      const body = await readBodyWithCap(response, MAX_RESPONSE_BYTES)
      if (!body.ok) return { ok: false, reason: 'blocked' }

      return {
        ok: true,
        html: body.text,
        durationMs,
        sizeBytes: body.byteLength,
        finalUrl: normalizedCurrent,
        finalStatus: response.status,
        redirectChain,
        redirectCount: redirectChain.length,
        xRobotsTag: response.headers.get('x-robots-tag'),
        contentType: response.headers.get('content-type'),
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

/** Returns the trimmed, tag-stripped text of every <h1>...</h1> element, in document order. */
export function getH1Texts(html: string): string[] {
  const matches = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) ?? []

  return matches.map((match) =>
    match
      .replace(/^<h1[^>]*>/i, '')
      .replace(/<\/h1>$/i, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

export function countH1(html: string): number {
  return getH1Texts(html).length
}

export type ExtractedImage = {
  src: string
  /** null = the alt attribute is absent entirely; '' = present but empty. Both count as "missing" for scoring, but the distinction is preserved here since callers may care. */
  alt: string | null
}

/**
 * Extracts `{src, alt}` for every `<img>` element that has a non-empty
 * `src`. An `<img>` without a usable `src` isn't a reliable image identity
 * (nothing to match against a WordPress Media Library URL later), so it's
 * skipped entirely rather than included with a guessed/empty src.
 */
export function getImages(html: string): ExtractedImage[] {
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? []
  const images: ExtractedImage[] = []

  for (const tag of imgTags) {
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i)
    if (!srcMatch || !srcMatch[1].trim()) continue

    const altMatch = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)
    images.push({ src: srcMatch[1].trim(), alt: altMatch ? altMatch[1] : null })
  }

  return images
}

/** Every image (with a usable src) whose alt attribute is absent or empty. */
export function getImagesMissingAlt(html: string): ExtractedImage[] {
  return getImages(html).filter((image) => !image.alt || image.alt.trim().length === 0)
}

export function hasImageMissingAlt(html: string): boolean {
  return getImagesMissingAlt(html).length > 0
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

/** Phase 26B: raw inner text of every `<script type="application/ld+json">` block, unparsed — the caller decides how to validate/interpret each one. */
export function getJsonLdBlocks(html: string): string[] {
  const matches = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? []

  return matches
    .map((tag) => tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim())
    .filter((block) => block.length > 0)
}

export type HreflangTag = { lang: string; href: string }

/** Phase 26B: every `<link rel="alternate" hreflang="..." href="...">` tag's raw lang code and href, in document order. Deliberately simple attribute matching (like getCanonicalHref) rather than a full HTML parser. */
export function getHreflangTags(html: string): HreflangTag[] {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []
  const tags: HreflangTag[] = []

  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']alternate["']/i.test(tag)) continue

    const hreflangMatch = tag.match(/hreflang\s*=\s*["']([^"']*)["']/i)
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']*)["']/i)

    if (hreflangMatch && hrefMatch && hreflangMatch[1].trim().length > 0 && hrefMatch[1].trim().length > 0) {
      tags.push({ lang: hreflangMatch[1].trim(), href: hrefMatch[1].trim() })
    }
  }

  return tags
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
