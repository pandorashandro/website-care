import 'server-only'
import { fetchWordPressApi } from './client'
import type { WordPressEditableContentResult } from './editable-content'

export type SeoProviderWriteStrategy =
  | { type: 'resource_meta'; field: string }
  | { type: 'provider_endpoint'; endpointKind: string }

export type SeoMetadataProviderResult =
  | {
      status: 'detected'
      provider: 'yoast' | 'rank_math' | 'aioseo'
      /** '' means the field was read and is genuinely empty; null means it could not be read at all. */
      currentMetaDescription: string | null
      writable: boolean
      writeStrategy: SeoProviderWriteStrategy | null
    }
  | { status: 'none'; provider: 'none'; reason: string }
  | { status: 'unknown'; provider: 'unknown'; reason: string }
  | { status: 'connection_error'; reason: string }

const YOAST_META_FIELD = '_yoast_wpseo_metadesc'
const RANK_MATH_META_FIELD = 'rank_math_description'

/**
 * Fetches WordPress's REST API index (GET /wp-json/) and returns its
 * `namespaces` list — a standard, always-registered discovery endpoint that
 * lists every active plugin's REST namespace, used here purely as a
 * corroborating/fallback signal. Returns null (not an error) on any
 * failure, since resource-level evidence alone may still be enough to
 * decide — a discovery failure should never by itself force a wrong
 * conclusion.
 */
async function fetchRestNamespaces(
  websiteUrl: string,
  username: string,
  applicationPassword: string
): Promise<string[] | null> {
  let origin: string
  try {
    origin = new URL(websiteUrl).origin
  } catch {
    return null
  }

  const result = await fetchWordPressApi(`${origin}/wp-json/`, username, applicationPassword)

  if (!result.ok || result.status < 200 || result.status >= 300) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.body)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null

  const namespaces = (parsed as Record<string, unknown>).namespaces
  if (!Array.isArray(namespaces)) return null

  return namespaces.filter((ns): ns is string => typeof ns === 'string')
}

function readMetaField(metaFields: Record<string, unknown> | null, field: string): string | undefined {
  if (!metaFields) return undefined
  const value = metaFields[field]
  return typeof value === 'string' ? value : undefined
}

/**
 * Determines which SEO plugin (if any) appears to control metadata for one
 * already-mapped, already-loaded WordPress resource, and whether its meta
 * description can be safely read/eventually written. READ-ONLY: issues at
 * most one extra GET request (namespace discovery) beyond what Prepare Fix
 * already fetches for the resource itself — every signal used here comes
 * either from that single extra request or from fields already present on
 * the resource response Prepare Fix loaded regardless of issue type.
 *
 * Never infers the editable value from rendered/computed fields (e.g.
 * Yoast's yoast_head_json, which reflects templated/final output, not the
 * raw stored meta description) and never claims a provider from ambiguous,
 * non-resource-tied evidence alone.
 */
export async function detectSeoMetadataProvider(
  websiteUrl: string,
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>,
  username: string,
  applicationPassword: string
): Promise<SeoMetadataProviderResult> {
  if (!URL.canParse(websiteUrl)) {
    return { status: 'connection_error', reason: 'This website does not have a valid URL on file.' }
  }

  const namespaces = await fetchRestNamespaces(websiteUrl, username, applicationPassword)

  const hasYoastNamespace = namespaces?.includes('yoast/v1') ?? false
  const hasRankMathNamespace = namespaces?.includes('rankmath/v1') ?? false
  const hasAioseoNamespace = namespaces?.some((ns) => ns.startsWith('aioseo')) ?? false

  // Yoast — resource-level yoast_head_json presence is specific and
  // reliable evidence on its own; the editable value (if any) comes only
  // from the separate registered meta field, never from yoast_head_json.
  if (content.hasYoastHeadJson || hasYoastNamespace) {
    const value = readMetaField(content.metaFields, YOAST_META_FIELD)

    if (value !== undefined) {
      return {
        status: 'detected',
        provider: 'yoast',
        currentMetaDescription: value,
        writable: true,
        writeStrategy: { type: 'resource_meta', field: YOAST_META_FIELD },
      }
    }

    return { status: 'detected', provider: 'yoast', currentMetaDescription: null, writable: false, writeStrategy: null }
  }

  // Rank Math — the registered meta field's presence is itself both the
  // detection signal and the value source.
  const rankMathValue = readMetaField(content.metaFields, RANK_MATH_META_FIELD)

  if (rankMathValue !== undefined) {
    return {
      status: 'detected',
      provider: 'rank_math',
      currentMetaDescription: rankMathValue,
      writable: true,
      writeStrategy: { type: 'resource_meta', field: RANK_MATH_META_FIELD },
    }
  }

  if (hasRankMathNamespace) {
    return { status: 'detected', provider: 'rank_math', currentMetaDescription: null, writable: false, writeStrategy: null }
  }

  // AIOSEO — only namespace-level (site-wide, not resource-tied) evidence is
  // currently available, which is not specific enough to confidently claim
  // the provider. Reported as unknown rather than guessed.
  if (hasAioseoNamespace) {
    return {
      status: 'unknown',
      provider: 'unknown',
      reason: 'An SEO plugin was detected, but Website Care could not confirm which metadata field it controls for this page yet.',
    }
  }

  if (namespaces === null) {
    return {
      status: 'unknown',
      provider: 'unknown',
      reason: "Website Care could not confirm which SEO plugin, if any, controls this page's metadata right now.",
    }
  }

  return { status: 'none', provider: 'none', reason: 'No supported SEO plugin was detected for this website.' }
}
