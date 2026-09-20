import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { TrustedMissingImageAltIssueResult } from './image-alt-issue'

/**
 * Unified webioom engine, Prompt 3 — closes the Prompt 2 blocker: the
 * SECOND trusted source of page/image identity for the SAME image-alt
 * Prepare/Apply Fix pipeline `image-alt-issue.ts`'s
 * `getTrustedMissingImageAltIssue` already serves for the legacy scanner.
 *
 * WHY A SECOND RESOLVER RATHER THAN CHANGING THE PIPELINE: every function
 * downstream of issue-identity resolution (`wordpressResources.loadEditable`,
 * `wordpressImageAltSource.detect`, `generateImageAltRecommendation`,
 * `wordpressWriters.imageAltMedia`/`imageAltContent`, `verifyPublicImageAlt`,
 * `recordFixHistory`, rollback) takes only `(websiteUrl, pageUrl, imageUrl,
 * credentials)` — none of it is coupled to the legacy `issues` table. Only
 * the very first step ("prove this opaque id genuinely belongs to a page/
 * image the current session owns") is table-specific. This function is that
 * same proof, walked against `pillar_finding_pages`/`pillar_findings`
 * instead of `issues`/`scans`, returning the IDENTICAL result shape so
 * `prepareFix`/`applyImageAltFix` (wordpress-fix-actions.ts /
 * wordpress-image-alt-fix-actions.ts) can call either resolver
 * interchangeably — see those two files' own dispatch-by-prefix comment.
 *
 * The browser identifies a pillar-based fix by `pillar:<pillar_finding_pages.id>`
 * — never a bare `(pageUrl, imageUrl)` pair — for the exact same reason the
 * legacy flow never accepts them as plain form fields: a user could edit a
 * hidden input before submitting.
 */
export async function getTrustedAccessibilityImageAltFinding(websiteId: string, findingPageId: string): Promise<TrustedMissingImageAltIssueResult> {
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
    .from('pillar_finding_pages')
    .select('id, url, affected_resource_url, finding_id')
    .eq('id', findingPageId)
    .maybeSingle()

  if (findingPageError || !findingPage) {
    return { ok: false, reason: 'This image issue could not be found.' }
  }

  // The finding must belong to THIS ownership-verified website — never
  // trusted from the finding_page row's own finding_id alone.
  const { data: finding, error: findingError } = await supabase
    .from('pillar_findings')
    .select('id, website_id, pillar, check_key')
    .eq('id', findingPage.finding_id)
    .eq('website_id', website.id)
    .maybeSingle()

  if (findingError || !finding) {
    return { ok: false, reason: 'This image issue could not be found.' }
  }

  if (finding.pillar !== 'accessibility' || finding.check_key !== 'images_missing_alt') {
    return { ok: false, reason: 'This fix type is not supported.' }
  }

  if (!findingPage.affected_resource_url || typeof findingPage.affected_resource_url !== 'string') {
    return {
      ok: false,
      reason: 'This image issue needs a fresh scan before webioom can prepare a fix.',
    }
  }

  const pageUrl = typeof findingPage.url === 'string' && findingPage.url ? findingPage.url : website.url

  return { ok: true, issue: { pageUrl, imageUrl: findingPage.affected_resource_url } }
}
