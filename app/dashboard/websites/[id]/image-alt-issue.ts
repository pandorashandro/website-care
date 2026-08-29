import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'

export type TrustedMissingImageAltIssue = {
  pageUrl: string
  imageUrl: string
}

export type TrustedMissingImageAltIssueResult =
  | { ok: true; issue: TrustedMissingImageAltIssue }
  | { ok: false; reason: string }

/**
 * The sole source of trusted page/image identity for the image-alt Prepare
 * Fix flow. The browser may only ever reference a missing_image_alt fix by
 * its opaque issue id — never by a plain pageUrl/imageUrl form field, which
 * a user could edit in a hidden input before submitting. This function
 * re-authenticates the session and walks the full ownership chain itself
 * (issue -> scan -> website -> user) rather than relying on RLS alone,
 * matching the explicit ownership checks every other fix action in this
 * codebase performs (e.g. getConnectedWordPressCredentials).
 */
export async function getTrustedMissingImageAltIssue(
  websiteId: string,
  issueId: string
): Promise<TrustedMissingImageAltIssueResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, reason: 'Missing information for this request.' }
  }

  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, url')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()

  if (websiteError || !website) {
    return { ok: false, reason: 'Missing information for this request.' }
  }

  const { data: issue, error: issueError } = await supabase
    .from('issues')
    .select('id, scan_id, title, page_url, image_url')
    .eq('id', issueId)
    .maybeSingle()

  if (issueError || !issue) {
    return { ok: false, reason: 'This image issue could not be found.' }
  }

  // The issue must belong to a scan that belongs to THIS ownership-verified
  // website — never trusted from the issue row's own scan_id alone.
  const { data: scan, error: scanError } = await supabase
    .from('scans')
    .select('id, website_id')
    .eq('id', issue.scan_id)
    .eq('website_id', website.id)
    .maybeSingle()

  if (scanError || !scan) {
    return { ok: false, reason: 'This image issue could not be found.' }
  }

  if (issue.title !== ISSUE_DEFINITIONS.missing_image_alt.title) {
    return { ok: false, reason: 'This fix type is not supported.' }
  }

  if (!issue.image_url || typeof issue.image_url !== 'string') {
    return {
      ok: false,
      reason: 'This image issue needs a fresh scan before webioom can prepare a fix.',
    }
  }

  // A null page_url is a pre-existing convention meaning "homepage" (see
  // formatPageLabel in page.tsx) — resolved the same way here.
  const pageUrl = typeof issue.page_url === 'string' && issue.page_url ? issue.page_url : website.url

  return { ok: true, issue: { pageUrl, imageUrl: issue.image_url } }
}
