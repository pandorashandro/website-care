import { isIP } from 'node:net'

const FETCH_TIMEOUT_MS = 10_000

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
 * user-supplied URL. This is a basic SSRF guard, not full protection — it
 * does not resolve DNS to catch hostnames that resolve to private IPs.
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    return true
  }

  return isIP(host) ? isPrivateIp(host) : false
}

export type FetchHomepageResult = { ok: true; html: string } | { ok: false }

export async function fetchHomepage(url: string): Promise<FetchHomepageResult> {
  const parsed = new URL(url)

  if (isBlockedHost(parsed.hostname)) {
    return { ok: false }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebsiteCareBot/1.0)' },
    })

    if (!response.ok) {
      return { ok: false }
    }

    return { ok: true, html: await response.text() }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timeout)
  }
}

export function isHttps(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

export function hasNonEmptyTitle(html: string): boolean {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return !!match && match[1].replace(/\s+/g, ' ').trim().length > 0
}

export function hasMetaDescription(html: string): boolean {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []

  return metaTags.some((tag) => {
    if (!/name\s*=\s*["']description["']/i.test(tag)) {
      return false
    }

    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)
    return !!content && content[1].trim().length > 0
  })
}

export function hasH1(html: string): boolean {
  return /<h1[^>]*>[\s\S]*?<\/h1>/i.test(html)
}

export function hasImageMissingAlt(html: string): boolean {
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? []

  return imgTags.some((tag) => {
    const alt = tag.match(/alt\s*=\s*["']([^"']*)["']/i)
    return !alt || alt[1].trim().length === 0
  })
}
