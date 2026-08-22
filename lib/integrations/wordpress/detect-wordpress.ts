import { fetchPage } from '@/lib/scanner/checks'

export type WordPressSignal = {
  id: string
  label: string
  points: number
  detected: boolean
}

export type WordPressStatus = 'confirmed' | 'likely' | 'unknown'

export type WordPressDetectionResult = {
  platform: 'wordpress' | 'unknown'
  confidence: number
  status: WordPressStatus
  /** Kept for internal/debugging use — the report UI does not render this by default. */
  signals: WordPressSignal[]
  restApiAvailable: boolean
}

const SIGNAL_POINTS = {
  restApi: 50,
  apiWOrgLink: 30,
  wpContent: 20,
  wpIncludes: 20,
  generator: 30,
} as const

const CONFIRMED_THRESHOLD = 70
const LIKELY_THRESHOLD = 40

function hasApiWOrgLink(html: string): boolean {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []
  return linkTags.some((tag) => /rel\s*=\s*["']https:\/\/api\.w\.org\/["']/i.test(tag))
}

function hasWpContentReference(html: string): boolean {
  return /\/wp-content\//i.test(html)
}

function hasWpIncludesReference(html: string): boolean {
  return /\/wp-includes\//i.test(html)
}

function getGeneratorContent(html: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []

  for (const tag of metaTags) {
    if (!/name\s*=\s*["']generator["']/i.test(tag)) continue

    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)
    if (content) return content[1].trim()
  }

  return null
}

function hasWordPressGenerator(html: string): boolean {
  const generator = getGeneratorContent(html)
  return !!generator && /wordpress/i.test(generator)
}

/**
 * True only if the body is valid JSON shaped like the WordPress REST API
 * index response (a `namespaces` array including "wp/v2", or a `routes`
 * object with wp/v2 route keys) — never based on HTTP status alone, so a
 * 200 response from some unrelated JSON endpoint at the same path doesn't
 * count.
 */
function looksLikeWordPressRestApi(body: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return false
  }

  if (!parsed || typeof parsed !== 'object') return false
  const obj = parsed as Record<string, unknown>

  if (
    Array.isArray(obj.namespaces) &&
    obj.namespaces.some((ns) => typeof ns === 'string' && /wp\/v2/i.test(ns))
  ) {
    return true
  }

  if (obj.routes && typeof obj.routes === 'object') {
    const routeKeys = Object.keys(obj.routes as Record<string, unknown>)
    if (routeKeys.some((key) => /\/wp\/v2/i.test(key))) {
      return true
    }
  }

  return false
}

/**
 * Fetches /wp-json/ from the site's origin via the existing secure fetch
 * (timeout, per-hop SSRF guard, redirect cap, no credentials, GET only, no
 * other endpoint ever touched). Re-checks that the response actually landed
 * on the same host as the site being scanned — fetchPage already blocks
 * redirects to private/blocked hosts, but this additionally guards against
 * trusting content from a different *public* domain the request happened
 * to be redirected to.
 */
async function checkRestApiAvailability(origin: string): Promise<boolean> {
  const result = await fetchPage(`${origin}/wp-json/`)
  if (!result.ok) return false
  if (result.finalStatus < 200 || result.finalStatus >= 300) return false

  const finalHostname = new URL(result.finalUrl).hostname.toLowerCase()
  const originHostname = new URL(origin).hostname.toLowerCase()
  if (finalHostname !== originHostname) return false

  return looksLikeWordPressRestApi(result.html)
}

function statusFor(confidence: number): WordPressStatus {
  if (confidence >= CONFIRMED_THRESHOLD) return 'confirmed'
  if (confidence >= LIKELY_THRESHOLD) return 'likely'
  return 'unknown'
}

/**
 * Detects whether a website appears to run WordPress, from multiple
 * independent public signals. Detection-only — never touches /wp-admin,
 * never authenticates, never enumerates users/plugins/themes.
 *
 * Live and uncached: called fresh on each report render (no schema change
 * this phase to persist a result), so it deliberately keeps its network
 * footprint to exactly two requests — homepage HTML and /wp-json/ — run in
 * parallel.
 */
export async function detectWordPress(websiteUrl: string): Promise<WordPressDetectionResult> {
  try {
    const origin = new URL(websiteUrl).origin

    const [homepageResult, restApiAvailable] = await Promise.all([
      fetchPage(websiteUrl),
      checkRestApiAvailability(origin),
    ])

    const html = homepageResult.ok ? homepageResult.html : ''

    const signals: WordPressSignal[] = [
      {
        id: 'rest_api',
        label: 'WordPress REST API confirmed',
        points: SIGNAL_POINTS.restApi,
        detected: restApiAvailable,
      },
      {
        id: 'api_w_org_link',
        label: 'api.w.org discovery link',
        points: SIGNAL_POINTS.apiWOrgLink,
        detected: hasApiWOrgLink(html),
      },
      {
        id: 'wp_content',
        label: 'wp-content reference',
        points: SIGNAL_POINTS.wpContent,
        detected: hasWpContentReference(html),
      },
      {
        id: 'wp_includes',
        label: 'wp-includes reference',
        points: SIGNAL_POINTS.wpIncludes,
        detected: hasWpIncludesReference(html),
      },
      {
        id: 'generator',
        label: 'WordPress generator meta tag',
        points: SIGNAL_POINTS.generator,
        detected: hasWordPressGenerator(html),
      },
    ]

    const confidence = Math.min(
      100,
      signals.reduce((sum, signal) => sum + (signal.detected ? signal.points : 0), 0)
    )

    const status = statusFor(confidence)

    return {
      platform: status === 'unknown' ? 'unknown' : 'wordpress',
      confidence,
      status,
      signals,
      restApiAvailable,
    }
  } catch {
    return {
      platform: 'unknown',
      confidence: 0,
      status: 'unknown',
      signals: [],
      restApiAvailable: false,
    }
  }
}
