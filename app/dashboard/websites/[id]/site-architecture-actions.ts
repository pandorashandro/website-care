'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseCrawlStore } from '@/lib/crawler/supabase-store'
import { createSupabaseArchitectureStore } from '@/lib/architecture/supabase-store'
import { analyzeArchitecture } from '@/lib/architecture/run-analysis'

/**
 * Phase 27 — the ownership-checked entry point into the Site Architecture
 * analysis engine. Mirrors technical-seo-actions.ts's own established
 * pattern exactly: re-derive ownership fresh via the ordinary
 * session-aware client BEFORE calling into lib/architecture/run-analysis.ts,
 * which itself uses the service-role admin client (crawl_analyses/
 * architecture_findings/architecture_finding_pages have no anon/
 * authenticated write grant — see the migration).
 *
 * `crawlRunId` is trusted only after confirming it belongs to a crawl_run
 * for THIS ownership-verified website — never taken as sufficient
 * authority on its own, so a caller cannot trigger analysis of (or read
 * findings for) another account's crawl by guessing/reusing a crawl_run id.
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

export type AnalyzeArchitectureCrawlRunResult = { ok: true; findingsCount: number; healthScore: number } | { ok: false; error: string }

export async function analyzeArchitectureCrawlRun(websiteId: string, crawlRunId: string): Promise<AnalyzeArchitectureCrawlRunResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  const crawlStore = createSupabaseCrawlStore()
  const crawlRun = await crawlStore.getCrawlRun(crawlRunId)

  if (!crawlRun || crawlRun.website_id !== website.id) {
    return { ok: false, error: 'Crawl not found.' }
  }

  const architectureStore = createSupabaseArchitectureStore()
  const result = await analyzeArchitecture(architectureStore, crawlRunId)

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, findingsCount: result.findings.length, healthScore: result.health.score }
}
