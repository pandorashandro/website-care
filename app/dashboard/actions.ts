'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { crawlWebsite } from '@/lib/scanner/crawl-website'
import { calculateHealthScore } from '@/lib/scanner/calculate-health-score'
import { checkRobots } from '@/lib/scanner/check-robots'
import { checkSitemap } from '@/lib/scanner/check-sitemap'
import { checkInternalLinks } from '@/lib/scanner/check-internal-links'
import type { ScanIssue } from '@/lib/scanner/issue-definitions'

export async function logout() {
  const supabase = await createClient()

  await supabase.auth.signOut()

  redirect('/login')
}

export type AddWebsiteState = { error?: string } | null

export async function addWebsite(
  _prevState: AddWebsiteState,
  formData: FormData
): Promise<AddWebsiteState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be logged in to add a website.' }
  }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const rawUrl = (formData.get('url') as string | null)?.trim() ?? ''

  if (!name) {
    return { error: 'Website name is required.' }
  }

  if (!rawUrl) {
    return { error: 'Website URL is required.' }
  }

  let normalizedUrl: string
  try {
    const parsed = new URL(rawUrl)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Website URL must start with http:// or https://.' }
    }

    normalizedUrl = parsed.toString()
  } catch {
    return { error: 'Enter a valid URL, e.g. https://example.com.' }
  }

  const { error } = await supabase.from('websites').insert({
    user_id: user.id,
    name,
    url: normalizedUrl,
  })

  if (error) {
    return { error: 'Could not save the website. Please try again.' }
  }

  revalidatePath('/dashboard')
  return {}
}

export type ScanWebsiteState = { error?: string } | null

export async function scanWebsite(
  _prevState: ScanWebsiteState,
  formData: FormData
): Promise<ScanWebsiteState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be logged in to scan a website.' }
  }

  const websiteId = formData.get('websiteId') as string | null

  if (!websiteId) {
    return { error: 'Missing website.' }
  }

  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, url')
    .eq('id', websiteId)
    .eq('user_id', user.id)
    .single()

  if (websiteError || !website) {
    return { error: 'Website not found.' }
  }

  const { data: scan, error: insertScanError } = await supabase
    .from('scans')
    .insert({ website_id: website.id, status: 'running' })
    .select('id')
    .single()

  if (insertScanError || !scan) {
    return { error: 'Could not start the scan. Please try again.' }
  }

  try {
    const result = await crawlWebsite(website.url)

    const pageIssueRows = result.pages.flatMap((page) =>
      page.issues.map((issue) => ({ pageUrl: page.url, issue }))
    )

    const robotsResult = await checkRobots(website.url)
    const sitemapIssues = await checkSitemap(website.url, robotsResult.sitemapUrls)
    const siteLevelIssues: ScanIssue[] = [...robotsResult.issues, ...sitemapIssues]
    const siteLevelIssueRows = siteLevelIssues.map((issue) => ({ pageUrl: website.url, issue }))

    const crawledUrls = new Set(result.pages.map((page) => page.url))
    const linkIssueRows = await checkInternalLinks(
      result.discoveredLinks,
      crawledUrls,
      result.hostname
    )

    const issueRows = [...pageIssueRows, ...siteLevelIssueRows, ...linkIssueRows].map((row) => ({
      scan_id: scan.id,
      page_url: row.pageUrl,
      type: row.issue.type,
      severity: row.issue.severity,
      title: row.issue.title,
      description: row.issue.description,
      recommendation: row.issue.recommendation,
      // Only ever set for missing_image_alt rows (one row per affected
      // image) — null for every other issue type.
      image_url: row.issue.imageUrl ?? null,
    }))

    if (issueRows.length > 0) {
      const { error: issuesError } = await supabase.from('issues').insert(issueRows)

      if (issuesError) {
        throw new Error('Could not save scan issues.')
      }
    }

    const healthScore = calculateHealthScore(issueRows, website.url)

    const { error: updateError } = await supabase
      .from('scans')
      .update({ status: 'completed', score: healthScore.overall })
      .eq('id', scan.id)

    if (updateError) {
      throw new Error('Could not save scan results.')
    }
  } catch (err) {
    await supabase.from('scans').update({ status: 'failed' }).eq('id', scan.id)

    return {
      error: err instanceof Error ? err.message : 'The scan failed unexpectedly.',
    }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/websites/${website.id}`)
  return {}
}