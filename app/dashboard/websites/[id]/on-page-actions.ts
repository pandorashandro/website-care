'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseCrawlStore } from '@/lib/crawler/supabase-store'
import { createSupabaseOnPageStore } from '@/lib/on-page/supabase-store'
import { analyzeOnPage } from '@/lib/on-page/run-analysis'

/**
 * Phase 28 — the ownership-checked entry point into the On-Page SEO
 * analysis engine. Mirrors site-architecture-actions.ts's own established
 * pattern exactly: re-derive ownership fresh via the ordinary
 * session-aware client BEFORE calling into lib/on-page/run-analysis.ts,
 * which itself uses the service-role admin client (crawl_analyses/
 * on_page_findings/on_page_finding_pages have no anon/authenticated write
 * grant — see the migration).
 */

async function getOwnedWebsite(websiteId: string): Promise<{ id: string } | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: website, error } = await supabase.from('websites').select('id').eq('id', websiteId).eq('user_id', user.id).single()

  if (error || !website) return null
  return website
}

export type AnalyzeOnPageCrawlRunResult = { ok: true; findingsCount: number; healthScore: number } | { ok: false; error: string }

export async function analyzeOnPageCrawlRun(websiteId: string, crawlRunId: string): Promise<AnalyzeOnPageCrawlRunResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  const crawlStore = createSupabaseCrawlStore()
  const crawlRun = await crawlStore.getCrawlRun(crawlRunId)

  if (!crawlRun || crawlRun.website_id !== website.id) {
    return { ok: false, error: 'Crawl not found.' }
  }

  const onPageStore = createSupabaseOnPageStore()
  const result = await analyzeOnPage(onPageStore, crawlRunId)

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, findingsCount: result.findings.length, healthScore: result.health.score }
}
