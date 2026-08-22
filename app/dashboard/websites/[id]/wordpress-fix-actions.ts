'use server'

import { mapWordPressContent, type WordPressContentMapping } from '@/lib/integrations/wordpress/content-mapping'
import { getConnectedWordPressCredentials } from './wordpress-credentials'

export type PrepareFixState = WordPressContentMapping | null

/**
 * Read-only: determines which WordPress page/post (if any) corresponds to
 * a scanned page URL. Never writes to WordPress or the database. Triggered
 * only when the user explicitly requests it for one page at a time — never
 * run automatically across every issue on the report.
 */
export async function prepareFix(
  _prevState: PrepareFixState,
  formData: FormData
): Promise<PrepareFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const pageUrl = formData.get('pageUrl') as string | null

  if (!websiteId || !pageUrl) {
    return { status: 'unmapped', reason: 'Missing information for this request.' }
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

  return mapWordPressContent(
    credentials.websiteUrl,
    pageUrl,
    credentials.username,
    credentials.applicationPassword
  )
}
