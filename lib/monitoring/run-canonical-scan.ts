import 'server-only'
import { startCrawlRun, processCrawlBatch, type BatchOutcome } from '@/lib/crawler/engine'
import { createSupabaseCrawlStore } from '@/lib/crawler/supabase-store'
import { createSupabaseTechnicalSeoStore } from '@/lib/technical-seo/supabase-store'
import { analyzeTechnicalSeo } from '@/lib/technical-seo/run-analysis'
import { createSupabaseOnPageStore } from '@/lib/on-page/supabase-store'
import { analyzeOnPage } from '@/lib/on-page/run-analysis'
import { createSupabaseArchitectureStore } from '@/lib/architecture/supabase-store'
import { analyzeArchitecture } from '@/lib/architecture/run-analysis'
import { createSupabaseContentStore } from '@/lib/content/supabase-store'
import { analyzeContent } from '@/lib/content/run-analysis'
import { interpretContentCompleteness } from '@/lib/content/ai/completeness-interpretation'
import { createSupabasePillarStore } from '@/lib/pillars/supabase-store'
import { analyzePerformance } from '@/lib/performance/run-analysis'
import { analyzeAccessibility } from '@/lib/accessibility/run-analysis'
import { analyzeSecurity } from '@/lib/security/run-analysis'
import type { CrawlRunRow } from '@/lib/crawler/types'

/**
 * Sprint 2, Prompt 2 — the SERVICE-CONTEXT (no browser, no user session)
 * counterpart to app/dashboard/websites/[id]/scan-actions.ts's
 * startUnifiedScan/continueUnifiedScan/runCategoryAnalyses, for the one
 * caller that genuinely has neither: the scheduled-monitoring pipeline
 * (monitoring-run.ts), triggered by a server-to-server cron request.
 *
 * THIS IS NOT A SECOND SCAN PIPELINE. Every function called below —
 * startCrawlRun, processCrawlBatch, analyzeTechnicalSeo, analyzeOnPage,
 * analyzeArchitecture, analyzeContent, analyzePerformance,
 * analyzeAccessibility, analyzeSecurity — is the exact same underlying
 * canonical engine function scan-actions.ts's own ownership-checked
 * wrapper actions call. Only the OWNERSHIP-ESTABLISHING layer differs:
 * scan-actions.ts's wrappers re-derive ownership from a cookie-bound user
 * session (lib/supabase/server.ts's createClient), which simply does not
 * exist during a cron invocation. This module's only caller
 * (lib/monitoring/monitoring-run.ts) instead establishes which website it
 * may act on through its own service-role due-work claim query — it can
 * only ever reach here for a website whose OWNER has already, themselves,
 * enabled monitoring for it (see lib/monitoring/due-service.ts) — never
 * from arbitrary, unauthenticated input. Every store used here
 * (createSupabaseCrawlStore et al.) is already the service-role admin
 * client underneath for BOTH the session-authenticated path and this one
 * — see lib/crawler/supabase-store.ts's own doc comment ("performs NO
 * ownership check of its own, by design, matching every other admin-client
 * module").
 */

export type RunCrawlToCompletionResult = { crawlRun: CrawlRunRow; done: boolean }

/**
 * Starts (or resumes an already-active) crawl for `websiteId`/`seedUrl`
 * and drives it forward with repeated `processCrawlBatch` calls — the
 * exact server-side analog of scan-website-controls.tsx's own client-side
 * driveCrawlToCompletion loop, needed here because there is no browser tab
 * to keep that loop alive across a cron invocation's own lifetime.
 *
 * Bounded by `deadlineMs` (an absolute `Date.now()` cutoff, not an
 * iteration count) so one cron invocation never risks exceeding its own
 * platform time limit. If the deadline is reached before the crawl
 * reaches a terminal state, this returns `done: false` with the crawl left
 * in whatever resumable state processCrawlBatch's own persisted frontier
 * already guarantees (see lib/crawler/engine.ts's own module doc comment)
 * — the NEXT cron invocation that reclaims this website resumes it via the
 * SAME startCrawlRun call, which finds the still-active crawl_run through
 * its own findActiveCrawlRun check rather than starting a duplicate one.
 */
export async function runCrawlToCompletion(websiteId: string, seedUrl: string, planMaxPages: number, deadlineMs: number): Promise<RunCrawlToCompletionResult> {
  const store = createSupabaseCrawlStore()
  const { crawlRun } = await startCrawlRun(store, websiteId, seedUrl, { planMaxPages })

  let outcome: BatchOutcome = await processCrawlBatch(store, crawlRun.id)
  while (!outcome.done && Date.now() < deadlineMs) {
    outcome = await processCrawlBatch(store, crawlRun.id)
  }

  const refreshed = await store.getCrawlRun(crawlRun.id)
  return { crawlRun: refreshed ?? crawlRun, done: outcome.done }
}

/**
 * The service-context equivalent of scan-actions.ts's runCategoryAnalyses
 * — the identical seven analyzers, the identical Promise.allSettled
 * isolation (one pillar analyzer failing never blocks the others from
 * persisting their own successful result), the identical single
 * `crawlRunId` passed to every one so all seven always describe the same
 * site-wide crawl generation.
 */
export async function runCategoryAnalysesForMonitoring(crawlRunId: string): Promise<void> {
  const runners: (() => Promise<unknown>)[] = [
    () => analyzeTechnicalSeo(createSupabaseTechnicalSeoStore(), crawlRunId),
    () => analyzeOnPage(createSupabaseOnPageStore(), crawlRunId),
    () => analyzeArchitecture(createSupabaseArchitectureStore(), crawlRunId),
    () => analyzeContent(createSupabaseContentStore(), crawlRunId, { completenessAiHook: interpretContentCompleteness }),
    () => analyzePerformance(createSupabasePillarStore(), crawlRunId),
    () => analyzeAccessibility(createSupabasePillarStore(), crawlRunId),
    () => analyzeSecurity(createSupabasePillarStore(), crawlRunId),
  ]

  await Promise.allSettled(runners.map((run) => run()))
}
