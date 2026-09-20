import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getTitleIssueKind, getMetaDescriptionIssueKind } from '@/lib/fixes/fix-preview'
import type { TrustedShopifyTitleIssueResult } from './shopify-title-issue'
import type { TrustedShopifyMetaIssueResult } from './shopify-meta-issue'
import type { TrustedWixTitleIssueResult } from './wix-title-issue'
import type { TrustedWixMetaIssueResult } from './wix-meta-issue'

/**
 * PAYABLE-V1 CLOSURE — the Shopify/Wix counterpart to
 * accessibility-image-alt-finding.ts's getTrustedAccessibilityImageAltFinding:
 * a second, symmetric ownership resolver that lets the CANONICAL On-Page SEO
 * engine's own findings (on_page_findings/on_page_finding_pages) reach the
 * EXISTING Shopify/Wix title/meta-description Prepare/Apply pipelines,
 * without touching those pipelines' own write/verify/rollback code at all.
 *
 * shopify-title-issue.ts's getTrustedShopifyTitleIssue (and its Wix/meta
 * siblings) already re-derive everything from the trusted DB row's own
 * `title` text via getTitleIssueKind/getMetaDescriptionIssueKind — the SAME
 * two classifier functions lib/fixes/fix-preview.ts now recognizes both
 * legacy AND canonical title strings for (see that file's own doc comment).
 * That means this resolver needs no new classification logic of its own:
 * it only needs to walk a DIFFERENT ownership chain
 * (on_page_finding_pages -> on_page_findings, which denormalizes its own
 * website_id column) down to the same {pageUrl, issueTitle} shape, then
 * hand off to the exact same classifiers the legacy resolvers already use.
 *
 * Re-authenticates the session and re-verifies website ownership on every
 * call — never trusts RLS alone, and never trusts an earlier check reused
 * across Prepare and Apply (this is called fresh at both, exactly like
 * every other trusted-issue resolver in this codebase).
 */
async function loadTrustedOnPageFinding(
  websiteId: string,
  findingPageId: string
): Promise<{ ok: true; pageUrl: string; issueTitle: string } | { ok: false; reason: string }> {
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

  const { data: findingPage, error: findingPageError } = await supabase
    .from('on_page_finding_pages')
    .select('id, url, finding_id')
    .eq('id', findingPageId)
    .maybeSingle()

  if (findingPageError || !findingPage) {
    return { ok: false, reason: 'This finding could not be found.' }
  }

  // finding.website_id is denormalized on on_page_findings itself — this
  // re-check is what actually proves the finding belongs to THIS
  // ownership-verified website, never trusted from the finding_id join alone.
  const { data: finding, error: findingError } = await supabase
    .from('on_page_findings')
    .select('id, website_id, title')
    .eq('id', findingPage.finding_id)
    .eq('website_id', website.id)
    .maybeSingle()

  if (findingError || !finding) {
    return { ok: false, reason: 'This finding could not be found.' }
  }

  const pageUrl = typeof findingPage.url === 'string' && findingPage.url ? findingPage.url : website.url

  return { ok: true, pageUrl, issueTitle: finding.title }
}

export async function getTrustedOnPageTitleFindingForShopify(websiteId: string, findingPageId: string): Promise<TrustedShopifyTitleIssueResult> {
  const base = await loadTrustedOnPageFinding(websiteId, findingPageId)
  if (!base.ok) return base

  const issueKind = getTitleIssueKind(base.issueTitle)
  if (!issueKind) return { ok: false, reason: 'This fix type is not supported.' }

  return { ok: true, issue: { pageUrl: base.pageUrl, issueTitle: base.issueTitle, issueKind } }
}

export async function getTrustedOnPageMetaFindingForShopify(websiteId: string, findingPageId: string): Promise<TrustedShopifyMetaIssueResult> {
  const base = await loadTrustedOnPageFinding(websiteId, findingPageId)
  if (!base.ok) return base

  const issueKind = getMetaDescriptionIssueKind(base.issueTitle)
  if (!issueKind) return { ok: false, reason: 'This fix type is not supported.' }

  return { ok: true, issue: { pageUrl: base.pageUrl, issueTitle: base.issueTitle, issueKind } }
}

export async function getTrustedOnPageTitleFindingForWix(websiteId: string, findingPageId: string): Promise<TrustedWixTitleIssueResult> {
  const base = await loadTrustedOnPageFinding(websiteId, findingPageId)
  if (!base.ok) return base

  const issueKind = getTitleIssueKind(base.issueTitle)
  if (!issueKind) return { ok: false, reason: 'This fix type is not supported.' }

  return { ok: true, issue: { pageUrl: base.pageUrl, issueTitle: base.issueTitle, issueKind } }
}

export async function getTrustedOnPageMetaFindingForWix(websiteId: string, findingPageId: string): Promise<TrustedWixMetaIssueResult> {
  const base = await loadTrustedOnPageFinding(websiteId, findingPageId)
  if (!base.ok) return base

  const issueKind = getMetaDescriptionIssueKind(base.issueTitle)
  if (!issueKind) return { ok: false, reason: 'This fix type is not supported.' }

  return { ok: true, issue: { pageUrl: base.pageUrl, issueTitle: base.issueTitle, issueKind } }
}
