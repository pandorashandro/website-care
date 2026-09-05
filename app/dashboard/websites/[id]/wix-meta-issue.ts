import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getMetaDescriptionIssueKind } from '@/lib/fixes/fix-preview'
import type { WixMetaDescriptionIssueKind } from '@/lib/integrations/wix/meta-proposal'

export type TrustedWixMetaIssue = {
  pageUrl: string
  issueTitle: string
  issueKind: WixMetaDescriptionIssueKind
}

export type TrustedWixMetaIssueResult = { ok: true; issue: TrustedWixMetaIssue } | { ok: false; reason: string }

/** Structurally identical to wix-title-issue.ts's getTrustedWixTitleIssue, differing only in which issue-kind classifier confirms the issue is actually a Meta Description-family issue. */
export async function getTrustedWixMetaIssue(websiteId: string, issueId: string): Promise<TrustedWixMetaIssueResult> {
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
