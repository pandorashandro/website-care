'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseCrawlStore } from '@/lib/crawler/supabase-store'
import { createSupabaseContentStore } from '@/lib/content/supabase-store'
import { analyzeContent } from '@/lib/content/run-analysis'
import { interpretContentCompleteness } from '@/lib/content/ai/completeness-interpretation'

/**
 * Phase 29 — the ownership-checked entry point into the Content
 * Intelligence analysis engine. Mirrors on-page-actions.ts's own
 * established pattern exactly: re-derive ownership fresh via the ordinary
 * session-aware client BEFORE calling into lib/content/run-analysis.ts,
 * which itself uses the service-role admin client.
 *
 * PHASE 29 TARGETED COMPLETION PASS — AI Completeness now wired live:
 * `interpretContentCompleteness` (lib/content/ai/completeness-interpretation.ts)
 * matches `CompletenessAiHook`'s exact signature and is passed here
 * unmodified — every safeguard that module already implements (bounded
 * input, structured-output validation, timeout, prompt-injection defense)
 * travels with it unchanged. `analyzeContentCompletenessWithAi`
 * (lib/content/checks/completeness-ai.ts) independently enforces the
 * bounded page count and low-extraction-confidence skip; `analyzeContent`
 * (lib/content/run-analysis.ts) isolates the whole AI step in its own
 * try/catch so an AI failure never fails deterministic analysis.
 * `generateAiCompletion` (lib/ai/client.ts) itself fails closed and never
 * throws when `ANTHROPIC_API_KEY` is not configured (returns an honest
 * 'not_configured' failure reason) — so this wiring is safe in every
 * environment: Completeness simply stays "Not Assessed" wherever AI is
 * unavailable, exactly as designed, never a false "Good".
 *
 * SCORE IMPACT FOR THIS INITIAL RELEASE: per this phase's own explicit
 * instruction ("do not trust model self-reported confidence enough to
 * alter health yet"), lib/content/checks/completeness-ai.ts now emits
 * EVERY AI-derived Completeness result — including the AI's own 'high'
 * self-reported confidence — as `kind: 'opportunity'` (ZERO Content Health
 * deduction), never `kind: 'problem'`. The `content_completeness_gap`
 * (problem) check key remains defined in the schema/type union for a
 * FUTURE release once AI accuracy has an empirical track record, but no
 * code path in this release ever produces one.
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

export type AnalyzeContentCrawlRunResult = { ok: true; findingsCount: number; healthScore: number } | { ok: false; error: string }

export async function analyzeContentCrawlRun(websiteId: string, crawlRunId: string): Promise<AnalyzeContentCrawlRunResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  const crawlStore = createSupabaseCrawlStore()
  const crawlRun = await crawlStore.getCrawlRun(crawlRunId)

  if (!crawlRun || crawlRun.website_id !== website.id) {
    return { ok: false, error: 'Crawl not found.' }
  }

  const contentStore = createSupabaseContentStore()
  const result = await analyzeContent(contentStore, crawlRunId, { completenessAiHook: interpretContentCompleteness })

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, findingsCount: result.findings.length, healthScore: result.health.score }
}
