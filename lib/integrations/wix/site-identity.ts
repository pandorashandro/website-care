import 'server-only'
import { fetchWixApi } from './client'

const SITE_PROPERTIES_PATH = '/site-properties/v4/properties'

export type WixSiteIdentityResult =
  | { ok: true; siteDisplayName: string | null; primaryLanguageCode: string | null }
  | { ok: false; reason: 'unauthorized' | 'forbidden' | 'connection_error' | 'malformed_response' }

/**
 * Reads a connected Wix site's display name and primary language via the
 * Site Properties API (`GET /site-properties/v4/properties`, requires only
 * the generic "Manage Your App" scope — confirmed callable with an
 * app-instance Client Credentials token, unlike the separate account-level
 * Sites API, which explicitly requires account-level/user auth and is NOT
 * reachable this way — see docs/wix-api-research.md §7.5).
 *
 * Deliberately does NOT attempt to return a site domain/URL for
 * cross-checking against the webioom website record's stored URL: no
 * currently-accessible Wix API exposes one for an ordinary (non-headless)
 * site (see docs/wix-api-research.md §7.5's full explanation — this is a
 * confirmed API gap, not an oversight).
 *
 * `primaryLanguageCode` is read here specifically because
 * lib/integrations/wix/resource-mapping.ts's callers need it to decide
 * whether a resolved item is in the site's primary language before Prompt
 * 2 ever attempts a write — the Item SEO Tags API can only write tags for
 * the primary language (docs/wix-api-research.md §6/§7).
 */
export async function getWixSiteIdentity(accessToken: string): Promise<WixSiteIdentityResult> {
  const result = await fetchWixApi(SITE_PROPERTIES_PATH, accessToken)

  if (!result.ok) {
    if (result.reason === 'unauthorized') return { ok: false, reason: 'unauthorized' }
    if (result.reason === 'forbidden') return { ok: false, reason: 'forbidden' }
    if (result.reason === 'malformed_response') return { ok: false, reason: 'malformed_response' }
    return { ok: false, reason: 'connection_error' }
  }

  const properties = result.data.properties
  if (!properties || typeof properties !== 'object') {
    return { ok: false, reason: 'malformed_response' }
  }

  const props = properties as Record<string, unknown>
  const siteDisplayName = typeof props.siteDisplayName === 'string' ? props.siteDisplayName : null

  let primaryLanguageCode: string | null = null
  const multilingual = props.multilingual
  if (multilingual && typeof multilingual === 'object') {
    const supportedLanguages = (multilingual as Record<string, unknown>).supportedLanguages
    if (Array.isArray(supportedLanguages)) {
      for (const entry of supportedLanguages) {
        if (
          entry &&
          typeof entry === 'object' &&
          (entry as Record<string, unknown>).isPrimary === true &&
          typeof (entry as Record<string, unknown>).languageCode === 'string'
        ) {
          primaryLanguageCode = (entry as Record<string, unknown>).languageCode as string
          break
        }
      }
    }
  }

  // A site with no multilingual setup at all has no supportedLanguages
  // entries — fall back to the plain top-level `language` field, which
  // every site reports.
  if (!primaryLanguageCode && typeof props.language === 'string') {
    primaryLanguageCode = props.language
  }

  return { ok: true, siteDisplayName, primaryLanguageCode }
}
