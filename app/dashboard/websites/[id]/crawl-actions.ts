'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import { startCrawlRun, processCrawlBatch, type BatchOutcome } from '@/lib/crawler/engine'
import { createSupabaseCrawlStore } from '@/lib/crawler/supabase-store'
import type { CrawlRunRow } from '@/lib/crawler/types'

/**
 * Phase 25A — the ownership-checked entry points into the crawler engine.
 * No UI calls these yet (Phase 25B owns that integration) — they exist so
 * the engine has a concrete, correctly-gated place to be invoked from once
 * it does, exactly mirroring how every existing fix-action file
 * (e.g. app/dashboard/actions.ts's scanWebsite) re-verifies session +
 * website ownership itself before ever touching the underlying feature,
 * never trusting a websiteId alone.
 *
 * Both functions re-derive ownership fresh via the ordinary session-aware
 * client BEFORE calling into lib/crawler/engine.ts, which itself uses the
 * service-role admin client (crawl_runs/crawl_pages/crawl_links have no
 * anon/authenticated write grant at all — see the migration) — the same
 * two-layer pattern every other integration in this codebase already
 * uses (shopify-credentials.ts's verifyWebsiteOwnership, wix-credentials.ts's
 * equivalent, etc.).
 */

export type StartWebsiteCrawlResult = { ok: true; crawlRun: CrawlRunRow; alreadyActive: boolean } | { ok: false; error: string }

async function getOwnedWebsite(websiteId: string): Promise<{ id: string; url: string } | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: website, error } = await supabase.from('websites').select('id, url').eq('id', websiteId).eq('user_id', user.id).single()

  if (error || !website) return null
  return website
}

/**
 * Phase 25B: `options.requestedPageBudget` is the ONLY crawl-sizing input
 * ever accepted from the browser, and it only ever influences the
 * `requested_page_budget` column (a display/audit value — "what did the
 * user ask for") — never the actual `effective_page_budget` a crawl is
 * bounded by. The real ceiling always comes from `entitlements.maxCrawlPages`,
 * resolved fresh here from the CURRENT session's own plan (never a value
 * the caller supplies), so a request cannot buy itself a bigger crawl than
 * its plan allows no matter what `requestedPageBudget` it sends — see
 * lib/crawler/limits.ts's clampPageBudget, which applies this ceiling
 * server-side inside startCrawlRun regardless.
 */
export async function startWebsiteCrawl(websiteId: string, options?: { requestedPageBudget?: number; maxDepth?: number }): Promise<StartWebsiteCrawlResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  const entitlements = await getCurrentUserEntitlements()
  const store = createSupabaseCrawlStore()
  const { crawlRun, alreadyActive } = await startCrawlRun(store, website.id, website.url, {
    ...options,
    planMaxPages: entitlements.maxCrawlPages,
  })

  return { ok: true, crawlRun, alreadyActive }
}

export type ContinueWebsiteCrawlResult = { ok: true; outcome: BatchOutcome } | { ok: false; error: string }

/**
 * Processes one bounded batch of an already-started crawl. Safe to call
 * repeatedly (see processCrawlBatch's own doc comment) — this IS the
 * "repeated bounded invocation" mechanism this phase's execution model
 * relies on; Phase 25B decides what actually triggers repeated calls in
 * production (a UI button, a scheduled re-invocation, etc.).
 *
 * `crawlRunId` is trusted only after confirming it belongs to a crawl_run
 * for THIS ownership-verified website — never taken as sufficient
 * authority on its own, so a caller cannot advance another user's crawl
 * by guessing/reusing a crawl_run id.
 */
export async function continueWebsiteCrawl(websiteId: string, crawlRunId: string): Promise<ContinueWebsiteCrawlResult> {
  const website = await getOwnedWebsite(websiteId)
  if (!website) return { ok: false, error: 'Website not found.' }

  const store = createSupabaseCrawlStore()
  const crawlRun = await store.getCrawlRun(crawlRunId)

  if (!crawlRun || crawlRun.website_id !== website.id) {
    return { ok: false, error: 'Crawl not found.' }
  }

  const outcome = await processCrawlBatch(store, crawlRunId)
  return { ok: true, outcome }
}
