'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseCrawlStore } from '@/lib/crawler/supabase-store'
import { createSupabasePillarStore } from '@/lib/pillars/supabase-store'
import { analyzePerformance } from '@/lib/performance/run-analysis'

/** Unified webioom engine, Prompt 2 — the ownership-checked entry point into the Performance canonical analysis engine, mirroring content-actions.ts's own established pattern exactly. */

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

export type AnalyzePerformanceCrawlRunResult = { ok: true; findingsCount: number; healthScore: number } | { ok: false; error: string }

export async function analyzePerformanceCrawlRun(websiteId: string, crawlRunId: string): Promise<AnalyzePerformanceCrawlRunResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  const crawlStore = createSupabaseCrawlStore()
  const crawlRun = await crawlStore.getCrawlRun(crawlRunId)
  if (!crawlRun || crawlRun.website_id !== website.id) return { ok: false, error: 'Crawl not found.' }

  const store = createSupabasePillarStore()
  const result = await analyzePerformance(store, crawlRunId)

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, findingsCount: result.findings.length, healthScore: result.health.score }
}
