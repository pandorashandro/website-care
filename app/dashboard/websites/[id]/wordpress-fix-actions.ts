'use server'

import {
  loadWordPressEditableContent,
  type WordPressEditableContentResult,
} from '@/lib/integrations/wordpress/editable-content'
import { getConnectedWordPressCredentials } from './wordpress-credentials'

export type PrepareFixState = WordPressEditableContentResult | null

/**
 * Read-only: maps a scanned page URL to its exact WordPress page/post (fresh,
 * every time — never trusts a previously-returned resourceId/restBase from
 * the browser) and, only if that succeeds, loads its current editable
 * content. Never writes to WordPress or the database. Triggered only when
 * the user explicitly requests it for one page at a time — never run
 * automatically across every issue on the report.
 */
export async function prepareFix(
  _prevState: PrepareFixState,
  formData: FormData
): Promise<PrepareFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const pageUrl = formData.get('pageUrl') as string | null

  if (!websiteId || !pageUrl) {
    return { status: 'unavailable', reason: 'Missing information for this request.' }
  }

  // Re-verifies Website Care session + website ownership internally before
  // ever touching wordpress_connections — never trusts the form's websiteId alone.
  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      status: 'connection_error',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  return loadWordPressEditableContent(
    credentials.websiteUrl,
    pageUrl,
    credentials.username,
    credentials.applicationPassword
  )
}
