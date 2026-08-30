import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getTitleIssueKind } from '@/lib/fixes/fix-preview'
import type { TitleIssueKind } from '@/lib/fixes/title-preview'

export type TrustedShopifyTitleIssue = {
  pageUrl: string
  issueTitle: string
  issueKind: TitleIssueKind
}

export type TrustedShopifyTitleIssueResult = { ok: true; issue: TrustedShopifyTitleIssue } | { ok: false; reason: string }

/**
 * The sole source of trusted page-URL/issue identity for the Shopify Title
 * fix flow. The browser may only ever reference a fix by its opaque issue
 * id — never by a plain pageUrl/title form field a user could edit before
 * submitting. Re-authenticates the session and walks the full ownership
 * chain (issue -> scan -> website -> user) itself on every call — at
 * Prepare AND again at Apply — rather than relying on RLS alone or on a
 * single check being reused across the two steps, mirroring
 * getTrustedMissingImageAltIssue's exact pattern (the strictest existing
 * trusted-issue precedent in this codebase) rather than WordPress Title's
 * looser browser-submitted-pageUrl model, per this phase's explicit
 * requirement that the issue itself be part of the authorization chain.
 */
export async function getTrustedShopifyTitleIssue(websiteId: string, issueId: string): Promise<TrustedShopifyTitleIssueResult> {
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
    .select('id, scan_id, title, page_url')
    .eq('id', issueId)
    .maybeSingle()

  if (issueError || !issue) {
    return { ok: false, reason: 'This issue could not be found.' }
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
    return { ok: false, reason: 'This issue could not be found.' }
  }

  const issueKind = getTitleIssueKind(issue.title)
  if (!issueKind) {
    return { ok: false, reason: 'This fix type is not supported.' }
  }

  // A null page_url is a pre-existing convention meaning "homepage" — but
  // Shopify homepage mapping is explicitly unsupported (20.1B), so this
  // will correctly fail closed downstream via resolveShopifyResource
  // rather than needing special handling here.
  const pageUrl = typeof issue.page_url === 'string' && issue.page_url ? issue.page_url : website.url

  return { ok: true, issue: { pageUrl, issueTitle: issue.title, issueKind } }
}
