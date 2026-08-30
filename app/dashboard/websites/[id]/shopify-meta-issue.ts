import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getMetaDescriptionIssueKind } from '@/lib/fixes/fix-preview'
import type { ShopifyMetaDescriptionIssueKind } from '@/lib/integrations/shopify/meta-proposal'

export type TrustedShopifyMetaIssue = {
  pageUrl: string
  issueTitle: string
  issueKind: ShopifyMetaDescriptionIssueKind
}

export type TrustedShopifyMetaIssueResult = { ok: true; issue: TrustedShopifyMetaIssue } | { ok: false; reason: string }

/**
 * The sole source of trusted page-URL/issue identity for the Shopify Meta
 * Description fix flow — structurally identical to
 * shopify-title-issue.ts's getTrustedShopifyTitleIssue (issue -> scan ->
 * website -> user ownership chain, re-walked fresh at both Prepare and
 * Apply), differing only in which issue-kind classifier confirms the
 * issue is actually a Meta Description-family issue.
 */
export async function getTrustedShopifyMetaIssue(websiteId: string, issueId: string): Promise<TrustedShopifyMetaIssueResult> {
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

  const { data: scan, error: scanError } = await supabase
    .from('scans')
    .select('id, website_id')
    .eq('id', issue.scan_id)
    .eq('website_id', website.id)
    .maybeSingle()

  if (scanError || !scan) {
    return { ok: false, reason: 'This issue could not be found.' }
  }

  const issueKind = getMetaDescriptionIssueKind(issue.title)
  if (!issueKind) {
    return { ok: false, reason: 'This fix type is not supported.' }
  }

  const pageUrl = typeof issue.page_url === 'string' && issue.page_url ? issue.page_url : website.url

  return { ok: true, issue: { pageUrl, issueTitle: issue.title, issueKind } }
}
