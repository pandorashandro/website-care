import 'server-only'
import { fetchWordPressApi, parseErrorCode, usersMeEndpoint } from './client'
import type { IntegrationCapabilityState } from '@/lib/integrations/platform'

/**
 * Type-level alias only (Phase 19.2) — the platform-independent vocabulary
 * for this exact three-state result now lives in lib/integrations/platform.ts.
 * Semantics are unchanged; every existing 'available'/'unavailable'/'unknown'
 * value in this file is still exactly that.
 */
export type CapabilityValue = IntegrationCapabilityState

export type WordPressCapabilities = {
  canEditPosts: CapabilityValue
  canEditPages: CapabilityValue
  canPublishPosts: CapabilityValue
  canUploadMedia: CapabilityValue
}

/**
 * - 'ok': the request succeeded (whether or not every individual capability
 *   could be read — partial/missing data still shows as 'unknown' per field).
 * - 'revoked': WordPress positively rejected the credential (401, or a 403
 *   whose error code is credential-shaped) — this is the only state that
 *   sets connectionValid to false.
 * - 'unreachable' / 'malformed': the check could not be completed this time
 *   (network, timeout, blocked, unexpected status, unparseable body) — never
 *   treated as proof the stored credential is bad.
 */
export type WordPressConnectionState = 'ok' | 'revoked' | 'unreachable' | 'malformed'

export type WordPressCapabilityResult = {
  connectionValid: boolean
  state: WordPressConnectionState
  capabilities: WordPressCapabilities
}

const UNKNOWN_CAPABILITIES: WordPressCapabilities = {
  canEditPosts: 'unknown',
  canEditPages: 'unknown',
  canPublishPosts: 'unknown',
  canUploadMedia: 'unknown',
}

function resultFor(
  state: WordPressConnectionState,
  capabilities: WordPressCapabilities
): WordPressCapabilityResult {
  return { connectionValid: state !== 'revoked', state, capabilities }
}

/**
 * Reads a single capability flag from the WordPress user's `capabilities`
 * map (the wp/v2/users/me?context=edit response shape). Explicit `true` ->
 * 'available'; explicit `false` -> 'unavailable'; anything else (missing
 * key, wrong type, or the capabilities object itself missing/malformed) ->
 * 'unknown'. Never inferred from role names, username, or user id.
 */
function readCapability(capabilities: unknown, key: string): CapabilityValue {
  if (!capabilities || typeof capabilities !== 'object') return 'unknown'

  const value = (capabilities as Record<string, unknown>)[key]
  if (value === true) return 'available'
  if (value === false) return 'unavailable'
  return 'unknown'
}

/**
 * Determines what the connected WordPress account appears able to do, by
 * inspecting the `capabilities` map on GET /wp-json/wp/v2/users/me?context=edit
 * — the same read-only endpoint already used to verify the connection at
 * connect time. Strictly read-only: only ever issues a GET request.
 *
 * Every field is conservative — 'available'/'unavailable' only when
 * WordPress's response explicitly says so; everything else becomes
 * 'unknown' rather than guessed. The returned value never contains
 * credentials of any kind.
 */
export async function checkWordPressCapabilities(
  websiteUrl: string,
  username: string,
  applicationPassword: string
): Promise<WordPressCapabilityResult> {
  const result = await fetchWordPressApi(usersMeEndpoint(websiteUrl), username, applicationPassword)

  if (!result.ok) {
    // timeout / network / blocked / cross_host_redirect / too_many_redirects
    // / https_required — none of these are evidence the credential itself
    // is bad, so the connection is not marked invalid.
    return resultFor('unreachable', UNKNOWN_CAPABILITIES)
  }

  if (result.status === 401) {
    return resultFor('revoked', UNKNOWN_CAPABILITIES)
  }

  if (result.status === 403) {
    const errorCode = parseErrorCode(result.body)
    if (/incorrect_password|invalid_username|invalid_email/i.test(errorCode)) {
      return resultFor('revoked', UNKNOWN_CAPABILITIES)
    }
    // Authenticated, but insufficiently privileged for context=edit — the
    // credential itself still works, so this is not "revoked."
    return resultFor('ok', UNKNOWN_CAPABILITIES)
  }

  if (result.status === 404) {
    // REST API (or this endpoint) unavailable right now — treat as a
    // transient condition, not proof the credential is bad.
    return resultFor('unreachable', UNKNOWN_CAPABILITIES)
  }

  if (result.status < 200 || result.status >= 300) {
    return resultFor('unreachable', UNKNOWN_CAPABILITIES)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.body)
  } catch {
    return resultFor('malformed', UNKNOWN_CAPABILITIES)
  }

  if (!parsed || typeof parsed !== 'object') {
    return resultFor('malformed', UNKNOWN_CAPABILITIES)
  }

  const capabilities = (parsed as Record<string, unknown>).capabilities

  return resultFor('ok', {
    canEditPosts: readCapability(capabilities, 'edit_posts'),
    canEditPages: readCapability(capabilities, 'edit_pages'),
    canPublishPosts: readCapability(capabilities, 'publish_posts'),
    canUploadMedia: readCapability(capabilities, 'upload_files'),
  })
}
