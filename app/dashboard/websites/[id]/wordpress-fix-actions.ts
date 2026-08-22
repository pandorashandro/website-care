'use server'

import { loadWordPressEditableContent } from '@/lib/integrations/wordpress/editable-content'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { buildFixPreview, classifyIssueForFixPreview, type FixPreview } from '@/lib/fixes/fix-preview'

export type PrepareFixState = FixPreview | null

/**
 * Read-only: for issue types outside the supported fix family, returns
 * 'unsupported' immediately — no credentials touched, no WordPress request
 * made. For supported (title / meta-description) issues, maps the scanned
 * page URL fresh, loads the exact editable resource, and — only for title
 * issues — generates a deterministic Current -> Proposed preview. Never
 * writes to WordPress or the database. Triggered only when the user
 * explicitly requests it for one page at a time.
 */
export async function prepareFix(
  _prevState: PrepareFixState,
  formData: FormData
): Promise<PrepareFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const pageUrl = formData.get('pageUrl') as string | null
  const issueTitle = formData.get('issueTitle') as string | null

  if (!websiteId || !pageUrl || !issueTitle) {
    return { status: 'unavailable', reason: 'Missing information for this request.' }
  }

  if (classifyIssueForFixPreview(issueTitle) === 'unsupported') {
    return { status: 'unsupported', reason: 'Preview not available yet for this fix type.' }
  }

  // Re-verifies Website Care session + website ownership internally before
  // ever touching wordpress_connections — never trusts the form's websiteId alone.
  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      status: 'unavailable',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  const content = await loadWordPressEditableContent(
    credentials.websiteUrl,
    pageUrl,
    credentials.username,
    credentials.applicationPassword
  )

  return buildFixPreview(issueTitle, content, credentials.websiteName)
}
