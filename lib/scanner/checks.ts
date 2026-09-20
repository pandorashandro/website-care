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
      /** Unified webioom engine, Prompt 2 — the small, fixed set of response headers the Performance and Security canonical engines need. Never a full header dump (unbounded, mostly irrelevant) — only the specific headers those two engines' own checks are documented to use. Raw string values (or null if absent), never interpreted here — interpretation belongs entirely to each engine's own checks. */
      responseHeaders: {
        contentEncoding: string | null
        cacheControl: string | null
        strictTransportSecurity: string | null
        contentSecurityPolicy: string | null
        xContentTypeOptions: string | null
        referrerPolicy: string | null
        xFrameOptions: string | null
        permissionsPolicy: string | null
      }
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
        responseHeaders: {
          contentEncoding: response.headers.get('content-encoding'),
          cacheControl: response.headers.get('cache-control'),
          strictTransportSecurity: response.headers.get('strict-transport-security'),
          contentSecurityPolicy: response.headers.get('content-security-policy'),
          xContentTypeOptions: response.headers.get('x-content-type-options'),
          referrerPolicy: response.headers.get('referrer-policy'),
          xFrameOptions: response.headers.get('x-frame-options'),
          permissionsPolicy: response.headers.get('permissions-policy'),
        },
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

/**
 * Rough estimate of visible page text, with scripts/styles/tags stripped and
 * entities decoded. Phase 29 — extracted from getVisibleTextLength's own
 * original inline implementation (unchanged byte-for-byte) so Content
 * Intelligence's word-count/paragraph extraction can reuse the exact same
 * stripping logic rather than a second, potentially-drifting copy.
 * getVisibleTextLength itself is now a one-line wrapper — its own behavior
 * (and every existing caller's, e.g. the legacy scanner's low_text_content
 * check) is completely unchanged.
 */
export function getVisibleText(html: string): string {
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

  return decoded.replace(/\s+/g, ' ').trim()
}

/** Rough estimate of visible page text length, with scripts/styles/tags stripped. */
export function getVisibleTextLength(html: string): number {
  return getVisibleText(html).length
}

/**
 * Phase 29 — the trimmed, tag-stripped text of every <p>...</p> element, in
 * document order, mirroring getH1Texts' exact extraction pattern. Used as
 * Content Intelligence's paragraph-level unit for structure/boilerplate/
 * duplicate-content analysis. Empty/whitespace-only paragraphs (e.g.
 * spacer `<p>&nbsp;</p>` elements some page builders emit) are excluded —
 * they carry no content signal and would otherwise inflate paragraph counts
 * with structurally-empty elements.
 */
export function getParagraphTexts(html: string): string[] {
  const matches = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) ?? []

  return matches
    .map((match) =>
      match
        .replace(/^<p[^>]*>/i, '')
        .replace(/<\/p>$/i, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((text) => text.length > 0)
}

/**
 * Phase 29 real-world evidence-quality pass — general, CMS-independent
 * SUBSTANTIVE CONTENT block extraction, broader than getParagraphTexts'
 * `<p>`-only scope. A real-world Bespoke crawl found visibly populated pages
 * extracting to 0 substantive words: their body copy was not wrapped in
 * literal `<p>` tags at all (a common page-builder pattern — text widgets,
 * icon boxes, testimonials, and CTAs are frequently rendered as `<div>`
 * containers rather than `<p>` elements). Root cause was extraction being
 * too narrow, not a persistence or database-default bug (see
 * docs/content-intelligence-engine.md's own root-cause section for the full
 * traced proof).
 *
 * ALGORITHM (regex-based, no HTML parser, no CMS-specific selectors):
 *
 *   1. Remove <script>/<style>/<noscript>/<template> elements ENTIRELY
 *      (tag AND content) — never content.
 *   2. Remove <nav>/<header>/<footer> elements ENTIRELY (tag AND content) —
 *      the standard HTML5 elements for navigation/site-header/site-footer
 *      chrome. Generic and semantic, not a CMS/theme-specific class
 *      dictionary; sites that don't use these tags simply get no exclusion
 *      here (conservative — never assumes chrome exists that isn't marked).
 *   3. Replace every remaining BLOCK-LEVEL tag boundary (both the opening
 *      and closing tag of p/div/li/section/article/blockquote/tr/td/th/
 *      figcaption/dd/dt) with a newline. This segments the flat HTML into
 *      block-sized text fragments WITHOUT ever duplicating a nested
 *      element's text — each character of the source HTML still appears
 *      exactly once; boundaries only decide where a fragment breaks. A
 *      `<div>intro<div>nested</div>outro</div>` becomes three fragments
 *      ("intro", "nested", "outro"), never a fourth fragment repeating
 *      "nested" inside a fourth "intro nested outro" combination the way a
 *      naive `element.textContent`-style recursive extraction would.
 *   4. Strip all remaining tags (inline elements: span/a/strong/em/b/i,
 *      and heading tags h1-h6, which are intentionally NOT block
 *      boundaries here — their own text is captured separately by
 *      getH1Texts/getH2Texts and would otherwise fragment normal prose that
 *      happens to follow a heading with no intervening block wrapper).
 *   5. Decode entities, split on the inserted newlines, trim/collapse
 *      whitespace per fragment, and drop empty fragments.
 *
 * DELIBERATELY NOT "count every text node" (the opposite failure mode this
 * phase's own instructions warn against): callers apply a minimum-word
 * filter per block (see lib/crawler/content-extract.ts's MIN_BLOCK_WORDS)
 * to exclude short leftover fragments (e.g. a 2-word menu label not wrapped
 * in <nav>) from counting as substantive content.
 *
 * KNOWN LIMITATION, documented rather than solved with a bigger heuristic:
 * no link-density filtering is applied — a genuine navigation/menu block
 * NOT wrapped in a semantic `<nav>`/`<header>`/`<footer>` tag/ARIA landmark
 * role could still leak through if its own text happens to clear the
 * minimum-word filter. Building reliable link-density detection would
 * require tracking anchor coverage per block before tag-stripping, a
 * meaningfully bigger DOM-aware mechanism this phase's own "do not build a
 * huge DOM-template engine" instruction rules out.
 */

/**
 * Strips every region whose OPENING tag matches `openTagPattern` (which must
 * be a global regex capturing the tag name in group 1) through its TRUE
 * matching closing tag — a small depth counter over same-named open/close
 * tags, not a single non-greedy regex. This matters specifically for the
 * ARIA-landmark case below: a `<div role="banner">` almost always contains
 * MULTIPLE nested `<div>` children (this is how virtually all page-builder
 * header/nav markup is actually structured), so a naive
 * `<div ...>[\s\S]*?<\/div>` would only strip through the FIRST inner
 * `</div>` it finds — silently leaving everything after that point (e.g. a
 * second CTA `<div>` inside the same header) uncounted as chrome. This
 * function still uses only regex scanning (no HTML parser/DOM), matching
 * this module's existing constraint, but tracks nesting depth so it finds
 * the region's real end.
 */
function stripBalancedRegions(html: string, openTagPattern: RegExp): string {
  let result = ''
  let cursor = 0
  openTagPattern.lastIndex = 0

  let openMatch: RegExpExecArray | null
  while ((openMatch = openTagPattern.exec(html)) !== null) {
    if (openMatch.index < cursor) continue // inside an already-stripped region

    result += html.slice(cursor, openMatch.index)

    const tagName = openMatch[1]
    const tagScan = new RegExp(`<${tagName}\\b[^>]*>|<\\/${tagName}\\s*>`, 'gi')
    tagScan.lastIndex = openTagPattern.lastIndex

    let depth = 1
    let regionEnd = html.length
    let scanMatch: RegExpExecArray | null
    while ((scanMatch = tagScan.exec(html)) !== null) {
      if (scanMatch[0].startsWith('</')) depth--
      else depth++
      if (depth === 0) {
        regionEnd = scanMatch.index + scanMatch[0].length
        break
      }
    }

    cursor = regionEnd
    openTagPattern.lastIndex = regionEnd
  }

  result += html.slice(cursor)
  return result
}

export function getSubstantiveBlocks(html: string): string[] {
  // Collapse any pre-existing newlines/tabs in the SOURCE HTML to spaces
  // FIRST (HTML whitespace is collapsible, so this changes no rendered
  // meaning) so that splitting on '\n' below only ever breaks on the block
  // boundaries THIS function inserts, never on a newline that happened to
  // already be present inside one paragraph's own text in the source.
  let text = html.replace(/[\r\n\t]+/g, ' ')

  text = text.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  text = stripBalancedRegions(text, /<(nav|header|footer|aside)\b[^>]*>/gi)

  // Real-world evidence pass: page-builder-generated markup (Elementor,
  // WPBakery, Divi, and many others) very rarely emits the semantic
  // <nav>/<header>/<footer>/<aside> tags themselves — it emits <div
  // role="..."> instead. The four WAI-ARIA landmark roles below are the
  // STANDARD, CMS-INDEPENDENT equivalents of those four tags (a web-standard
  // accessibility convention, not a signal specific to any one site or
  // builder), so the same chrome that would already be excluded if it used
  // semantic tags is excluded here too — via stripBalancedRegions, since
  // these divs are essentially always multiply-nested in real markup.
  text = stripBalancedRegions(text, /<(\w+)\b[^>]*\brole\s*=\s*["'](?:banner|navigation|contentinfo|complementary)["'][^>]*>/gi)

  // WCAG "bypass blocks" skip links (technique G1) are a universal
  // accessibility idiom present on the vast majority of modern sites
  // regardless of CMS or framework — "Skip to main content" / "Skip to
  // content" / "Skip navigation" is standardized phrasing, not this site's
  // own copy, so excluding it is a generic structural signal, not a
  // per-site hardcode. These anchors carry no page-specific content.
  text = text.replace(/<a\b[^>]*>[\s\S]{0,60}?\bskip\s+(?:to\s+)?(?:the\s+)?(?:main\s+)?(?:content|navigation|nav)\b[\s\S]{0,60}?<\/a>/gi, ' ')

  text = text.replace(/<\/?(p|div|li|section|article|blockquote|tr|td|th|figcaption|dd|dt)\b[^>]*>/gi, '\n')
  text = text.replace(/<[^>]*>/g, ' ')
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  return text
    .split('\n')
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter((block) => block.length > 0)
}

/**
 * Phase 29 — the trimmed, tag-stripped text of every <h2>...</h2> element,
 * in document order, mirroring getH1Texts exactly one level down. Used as a
 * weak "section heading" structural signal (heading count, and later a
 * question/FAQ-signal check) — never treated as proof a specific section is
 * present or absent, only as evidence of how much heading-level structure a
 * page has.
 */
export function getH2Texts(html: string): string[] {
  const matches = html.match(/<h2[^>]*>[\s\S]*?<\/h2>/gi) ?? []

  return matches.map((match) =>
    match
      .replace(/^<h2[^>]*>/i, '')
      .replace(/<\/h2>$/i, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
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

/**
 * Unified webioom engine, Prompt 2 — deterministic, regex-based evidence
 * extraction for the Performance/Accessibility/Security canonical engines,
 * mirroring every prior extractor in this file: no HTML parser, no DOM, no
 * headless browser — the same already-fetched HTML every other extractor
 * here already processes, computed once at crawl time (see
 * lib/crawler/pillar-extract.ts). Each function is a narrow, honestly-named
 * fact about the markup, never a claim beyond what static inspection can
 * actually prove (see each engine's own doc comment for the exact
 * evidence-vs-verdict boundary).
 */

function getAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match ? match[1] : null
}

/** True if `tag` carries the named attribute, EITHER as a valued attribute (`name="..."`) or a bare HTML boolean attribute (`defer`, `async`, with no `=` at all) — both are valid HTML and must both count. */
function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*(=|[\\s/>])`, 'i').test(tag)
}

function stripTagsToText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every <img ...> opening tag, verbatim, in document order. */
export function getImgTags(html: string): string[] {
  return html.match(/<img\b[^>]*>/gi) ?? []
}

/** The <html> tag's own `lang` attribute value, or null if the tag/attribute is missing or empty — WCAG 3.1.1, a fully static, zero-ambiguity check. */
export function getHtmlLangAttribute(html: string): string | null {
  const match = html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']*)["']/i)
  if (!match) return null
  const lang = match[1].trim()
  return lang.length > 0 ? lang : null
}

/** Images with NO `alt` attribute at all — deliberately NOT `alt=""`, which is a legitimate, valid "decorative image" pattern per WCAG and must never be counted as a defect. */
export function countImagesMissingAlt(html: string): number {
  return getImgTags(html).filter((tag) => !hasAttr(tag, 'alt')).length
}

const MAX_MISSING_ALT_SRCS_PER_PAGE = 20

/**
 * Unified webioom Prompt 3 — the exact `src` of every image missing an alt
 * attribute (same "attribute absent, not merely empty" definition as
 * countImagesMissingAlt above — deliberately NOT getImagesMissingAlt's own
 * definition, which also treats `alt=""` as missing; that's the right call
 * for the LEGACY single-page scanner's scoring but would contradict this
 * engine's own documented "empty alt is a valid decorative pattern" rule).
 * Bounded to MAX_MISSING_ALT_SRCS_PER_PAGE — a genuine per-image identity
 * list, not unlimited DOM data, so the crawler can persist real,
 * individually-actionable evidence (needed to safely target a specific
 * image for an image-alt fix) without storing raw HTML or an unbounded
 * array. Reuses getImages' own {src, alt} extraction — no new regex.
 */
export function getImageSrcsMissingAlt(html: string): string[] {
  return getImages(html)
    .filter((image) => image.alt === null)
    .map((image) => image.src)
    .slice(0, MAX_MISSING_ALT_SRCS_PER_PAGE)
}

/** Images missing an explicit `width` or `height` attribute — a real, common cause of layout shift (CLS) the browser cannot reserve space for ahead of time. */
export function countImagesMissingDimensions(html: string): number {
  return getImgTags(html).filter((tag) => !hasAttr(tag, 'width') || !hasAttr(tag, 'height')).length
}

/** The first few images on a page are commonly above-the-fold content that SHOULD load eagerly (lazy-loading them would hurt, not help, perceived load speed) — only images beyond this count are considered for the lazy-loading opportunity below. */
const LAZY_LOAD_EXEMPT_IMAGE_COUNT = 3

/** Images beyond the first few without `loading="lazy"` — a deliberately conservative opportunity signal, never applied to the images most likely to be above the fold. */
export function countImagesMissingLazyLoading(html: string): number {
  return getImgTags(html)
    .slice(LAZY_LOAD_EXEMPT_IMAGE_COUNT)
    .filter((tag) => getAttr(tag, 'loading')?.toLowerCase() !== 'lazy').length
}

/** External `<script src="...">` tags — a page's total script-request burden. */
export function countExternalScripts(html: string): number {
  return (html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi) ?? []).length
}

/** External scripts inside `<head>` with neither `async` nor `defer` — these block HTML parsing until they load and execute, a well-established, purely structural render-blocking signal. */
export function countRenderBlockingHeadScripts(html: string): number {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  if (!headMatch) return 0
  const scripts = headMatch[1].match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi) ?? []
  return scripts.filter((tag) => !hasAttr(tag, 'async') && !hasAttr(tag, 'defer')).length
}

/** External `<link rel="stylesheet">` tags — every one is a render-blocking request by default. */
export function countStylesheets(html: string): number {
  return (html.match(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi) ?? []).length
}

const LABEL_EXEMPT_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image'])

/** Form fields (input/select/textarea, excluding hidden/submit/button/reset/image inputs) with no associated `<label for>`, no `aria-label`, `aria-labelledby`, or `title` — a screen-reader user would hear no name for the field at all. */
export function countFormInputsMissingLabel(html: string): number {
  const labelForTargets = new Set(
    (html.match(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi) ?? [])
      .map((tag) => getAttr(tag, 'for'))
      .filter((value): value is string => !!value)
  )

  const fields = html.match(/<(?:input|select|textarea)\b[^>]*>/gi) ?? []

  return fields.filter((tag) => {
    const type = getAttr(tag, 'type')?.toLowerCase()
    if (type && LABEL_EXEMPT_INPUT_TYPES.has(type)) return false
    if (hasAttr(tag, 'aria-label') || hasAttr(tag, 'aria-labelledby') || hasAttr(tag, 'title')) return false
    const id = getAttr(tag, 'id')
    return !(id && labelForTargets.has(id))
  }).length
}

/** Links with no visible text AND no `aria-label`/`aria-labelledby`/`title` — a screen-reader/assistive-tech user has no way to know what an icon-only link does. */
export function countLinksMissingAccessibleName(html: string): number {
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []

  return anchors.filter((anchor) => {
    const openTag = anchor.match(/^<a\b[^>]*>/i)?.[0] ?? ''
    if (hasAttr(openTag, 'aria-label') || hasAttr(openTag, 'aria-labelledby') || hasAttr(openTag, 'title')) return false
    const innerText = stripTagsToText(anchor.replace(/^<a\b[^>]*>/i, '').replace(/<\/a>$/i, ''))
    return innerText.length === 0
  }).length
}

/** Count of `id="..."` values that appear more than once anywhere on the page — duplicate ids can break `label for`/ARIA references and fragment-link navigation. */
export function countDuplicateIds(html: string): number {
  const ids = (html.match(/\bid\s*=\s*["']([^"']+)["']/gi) ?? [])
    .map((match) => match.match(/["']([^"']+)["']/)?.[1])
    .filter((value): value is string => !!value)

  const seen = new Set<string>()
  let duplicates = 0
  for (const id of ids) {
    if (seen.has(id)) duplicates++
    else seen.add(id)
  }
  return duplicates
}

/** `<iframe>` elements with no (or empty) `title` attribute — a screen-reader user has no way to know what an embedded frame contains. */
export function countIframesMissingTitle(html: string): number {
  return (html.match(/<iframe\b[^>]*>/gi) ?? []).filter((tag) => !getAttr(tag, 'title')?.trim()).length
}

const MIXED_CONTENT_REFERENCE_PATTERN = /\b(?:src|href|action)\s*=\s*["'](http:\/\/[^"']+)["']/gi
const MAX_MIXED_CONTENT_URLS_PER_PAGE = 10

/** `src`/`href`/`action` attributes referencing a plain `http://` URL, counted ONLY when the page itself was served over https — a genuine mixed-content signal (browsers actively block/warn on this), never evaluated on an already-insecure page where it would be redundant noise. */
export function countMixedContentReferences(html: string, pageIsHttps: boolean): number {
  if (!pageIsHttps) return 0
  return (html.match(MIXED_CONTENT_REFERENCE_PATTERN) ?? []).length
}

/**
 * PAYABLE-V1 remediation-depth pass — the exact insecure `http://` URL of
 * each mixed-content reference (bounded, mirroring
 * getImageSrcsMissingAlt's own per-page cap), so the finding can name
 * WHICH resource is insecure instead of only how many exist. Reuses the
 * identical matching pattern countMixedContentReferences already applies
 * — this is not a new detection, only capturing what that regex already
 * matches instead of discarding it via .length.
 */
export function getMixedContentUrls(html: string, pageIsHttps: boolean): string[] {
  if (!pageIsHttps) return []
  const urls: string[] = []
  for (const match of html.matchAll(MIXED_CONTENT_REFERENCE_PATTERN)) {
    if (match[1]) urls.push(match[1])
    if (urls.length >= MAX_MIXED_CONTENT_URLS_PER_PAGE) break
  }
  return urls
}

/** `<form action="http://...">` — a form that submits its data over plain HTTP, the clearest possible static evidence of an insecure form regardless of what page it lives on. */
export function countInsecureForms(html: string): number {
  return (html.match(/<form\b[^>]*>/gi) ?? []).filter((tag) => {
    const action = getAttr(tag, 'action')
    return !!action && action.toLowerCase().startsWith('http://')
  }).length
}
