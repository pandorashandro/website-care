import 'server-only'
import {
  checkWordPressCapabilities,
  type WordPressCapabilityResult,
} from '@/lib/integrations/wordpress/capabilities'
import { resolveRequiredWordPressCapability } from '@/lib/integrations/wordpress/adapter'
import type { IntegrationConnectionState, IntegrationCapabilitySnapshot } from '@/lib/integrations/platform'
import { getConnectedWordPressCredentials } from './wordpress-credentials'

export type WordPressConnectionSummary =
  | { connected: false }
  | ({ connected: true; displayName: string | null } & WordPressCapabilityResult)

const REVOKED_UNKNOWN_RESULT: WordPressCapabilityResult = {
  connectionValid: false,
  state: 'revoked',
  capabilities: {
    canEditPosts: 'unknown',
    canEditPages: 'unknown',
    canPublishPosts: 'unknown',
    canUploadMedia: 'unknown',
  },
}

/**
 * Server-side only. Ownership verification and credential decryption are
 * delegated to getConnectedWordPressCredentials (shared with the content
 * mapping flow) rather than duplicated here.
 *
 * If there is no 'connected' row, returns { connected: false } without
 * attempting decryption or any authenticated WordPress request.
 */
export async function getWordPressConnectionSummary(
  websiteId: string
): Promise<WordPressConnectionSummary> {
  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    if (credentials.reason === 'decrypt_failed') {
      return {
        connected: true,
        displayName: credentials.displayName,
        ...REVOKED_UNKNOWN_RESULT,
      }
    }
    return { connected: false }
  }

  const capabilityResult = await checkWordPressCapabilities(
    credentials.websiteUrl,
    credentials.username,
    credentials.applicationPassword
  )

  return {
    connected: true,
    displayName: credentials.displayName,
    ...capabilityResult,
  }
}

export type IntegrationFixabilityInputs = {
  connectionState: IntegrationConnectionState
  /** Only present when connectionState === 'connected'. */
  capabilities: IntegrationCapabilitySnapshot | null
}

/**
 * Phase 19.4 — thin, explicit mapper from the WordPress-specific connection
 * summary to the generic shape lib/fixes/fixability.ts actually consumes.
 * Does not change getWordPressConnectionSummary's behavior or return value
 * at all — this only translates its already-computed result. WordPress's
 * finer-grained diagnostic state (ok/revoked/unreachable/malformed) is
 * intentionally not threaded through here; fixability never consulted it
 * even before this phase (it only ever branched on `connected` and
 * `connectionValid`), so nothing is lost from fixability's point of view —
 * the finer detail remains available on the WordPressConnectionSummary
 * itself for anything else that wants it (e.g. the integrations UI).
 */
export function toIntegrationFixabilityInputs(summary: WordPressConnectionSummary): IntegrationFixabilityInputs {
  if (!summary.connected) {
    return { connectionState: 'not_connected', capabilities: null }
  }

  if (!summary.connectionValid) {
    return { connectionState: 'needs_attention', capabilities: null }
  }

  return {
    connectionState: 'connected',
    capabilities: {
      edit_content: resolveRequiredWordPressCapability('edit_content', summary.capabilities),
      upload_media: resolveRequiredWordPressCapability('upload_media', summary.capabilities),
    },
  }
}
