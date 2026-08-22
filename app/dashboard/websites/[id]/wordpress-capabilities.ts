import 'server-only'
import {
  checkWordPressCapabilities,
  type WordPressCapabilityResult,
} from '@/lib/integrations/wordpress/capabilities'
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
