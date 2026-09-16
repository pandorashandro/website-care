'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseCrawlStore } from '@/lib/crawler/supabase-store'
import { createSupabaseTechnicalSeoStore } from '@/lib/technical-seo/supabase-store'
import { analyzeTechnicalSeo } from '@/lib/technical-seo/run-analysis'

/**
 * Phase 26 — the ownership-checked entry point into the Technical SEO
 * analysis engine. Mirrors app/dashboard/websites/[id]/crawl-actions.ts's
 * own established pattern exactly: re-derive ownership fresh via the
 * ordinary session-aware client BEFORE calling into
 * lib/technical-seo/run-analysis.ts, which itself uses the service-role
 * admin client (crawl_analyses/technical_findings/technical_finding_pages
 * have no anon/authenticated write grant — see the migration).
 *
 * `crawlRunId` is trusted only after confirming it belongs to a crawl_run
 * for THIS ownership-verified website — never taken as sufficient
 * authority on its own, exactly like continueWebsiteCrawl's own guard, so a
 * caller cannot trigger analysis of (or read findings for) another
 * account's crawl by guessing/reusing a crawl_run id.
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

export type AnalyzeCrawlRunResult = { ok: true; findingsCount: number; healthScore: number } | { ok: false; error: string }

export async function analyzeCrawlRun(websiteId: string, crawlRunId: string): Promise<AnalyzeCrawlRunResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  const crawlStore = createSupabaseCrawlStore()
  const crawlRun = await crawlStore.getCrawlRun(crawlRunId)

  if (!crawlRun || crawlRun.website_id !== website.id) {
    return { ok: false, error: 'Crawl not found.' }
  }

  const technicalSeoStore = createSupabaseTechnicalSeoStore()
  const result = await analyzeTechnicalSeo(technicalSeoStore, crawlRunId)

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, findingsCount: result.findings.length, healthScore: result.health.score }
}
