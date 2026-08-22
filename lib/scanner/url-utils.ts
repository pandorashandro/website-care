import { extractHrefs } from './checks'

const EXCLUDED_EXTENSIONS = [
  // images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.avif',
  // stylesheets / scripts
  '.css',
  '.js',
  '.mjs',
  // documents
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  // video / audio
  '.mp4',
  '.mp3',
  '.wav',
  '.avi',
  '.mov',
  '.webm',
  '.ogg',
  // archives / downloads
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.exe',
  '.dmg',
  // fonts / data
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.xml',
  '.json',
]

function hasExcludedExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  return EXCLUDED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Resolves a (possibly relative) URL against a base, strips the fragment,
 * and normalizes trailing slashes. Returns null for anything that isn't a
 * plain http/https URL — this is what filters out mailto:, tel:,
 * javascript:, and other non-navigable schemes.
 */
export function normalizeUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(rawUrl, baseUrl)

    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null
    }

    resolved.hash = ''

    if (resolved.pathname.length > 1 && resolved.pathname.endsWith('/')) {
      resolved.pathname = resolved.pathname.slice(0, -1)
    }

    return resolved.toString()
  } catch {
    return null
  }
}

export function isSameHost(url: string, hostname: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === hostname.toLowerCase()
  } catch {
    return false
  }
}

/** True for normal HTML page URLs — excludes known non-page asset types. */
export function isCrawlablePageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return !hasExcludedExtension(parsed.pathname)
  } catch {
    return false
  }
}

/**
 * Extracts, resolves, and filters same-host internal links from a page's
 * HTML, deduplicated. `pageUrl` is the base used to resolve relative hrefs.
 */
export function extractInternalLinks(html: string, pageUrl: string, hostname: string): string[] {
  const found = new Set<string>()

  for (const href of extractHrefs(html)) {
    const normalized = normalizeUrl(href, pageUrl)
    if (!normalized) continue
    if (!isSameHost(normalized, hostname)) continue
    if (!isCrawlablePageUrl(normalized)) continue

    found.add(normalized)
  }

  return Array.from(found)
}
