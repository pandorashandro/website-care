import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient as createSupabaseJsClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Sprint 2, Prompt 3 — STEP 6/10. REAL Postgres integration coverage for
 * the concurrency/idempotency guarantees Prompt 2's own report could only
 * verify by code review. This file calls the SAME production service
 * modules (lib/monitoring/due-service.ts, event-service.ts,
 * delivery-service.ts, monitoring-run.ts) the real cron route uses — it is
 * NOT a second monitoring implementation.
 *
 * SAFE BY CONSTRUCTION, NOT BY CONVENTION:
 * - Skipped entirely (describe.skipIf) unless RUN_MONITORING_DB_INTEGRATION=1
 *   is explicitly set — the default `npm test`/`vitest run` invocation never
 *   touches any database, local or otherwise.
 * - The URL/key below are Supabase's own well-known, publicly documented
 *   local-development demo credentials (identical in every `supabase init`
 *   scaffold and Supabase's own docs) — not a secret, and only ever valid
 *   against 127.0.0.1. This file REFUSES to run (throws in beforeAll) if
 *   LOCAL_SUPABASE_URL is not a loopback address, so a misconfigured
 *   environment variable can never point this suite at a real project.
 * - Overrides process.env.NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 *   only for the lifetime of this file's own process — this is what makes
 *   lib/supabase/admin.ts's createAdminClient() (called internally by every
 *   monitoring service module under test) transparently target the local
 *   stack instead of requiring any test-only client-injection seam in
 *   production code.
 *
 * PREREQUISITE (not performed by this file): a local Supabase stack running
 * with exactly the migrations under tests/integration/README.md's own list
 * applied — see that file for the exact `supabase start` invocation used to
 * produce the verified run this suite's own report describes.
 */

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const RUN = process.env.RUN_MONITORING_DB_INTEGRATION === '1'

if (RUN && !new URL(LOCAL_SUPABASE_URL).hostname.match(/^(127\.0\.0\.1|localhost)$/)) {
  throw new Error('Refusing to run monitoring DB integration tests against a non-loopback URL.')
}

describe.skipIf(!RUN)('Sprint 2 Prompt 3 — REAL Postgres integration (local Supabase only)', () => {
  let admin: SupabaseClient
  const createdUserIds: string[] = []

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_ROLE_KEY
    admin = createSupabaseJsClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  })

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => {})
    }
  })

  async function createTestUserAndWebsite(url: string): Promise<{ userId: string; websiteId: string }> {
    const email = `monitoring-it-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
    const { data: userData, error: userError } = await admin.auth.admin.createUser({ email, password: 'Test-Password-123!', email_confirm: true })
    if (userError || !userData.user) throw new Error(`could not create test user: ${userError?.message}`)
    createdUserIds.push(userData.user.id)

    const { data: website, error: websiteError } = await admin.from('websites').insert({ user_id: userData.user.id, name: 'Integration Test Site', url }).select('id').single()
    if (websiteError || !website) throw new Error(`could not create test website: ${websiteError?.message}`)

    return { userId: userData.user.id, websiteId: website.id }
  }

  async function enableMonitoringDue(websiteId: string, overrides: Partial<{ runStatus: string; claimedAt: string | null }> = {}) {
    const pastDue = new Date(Date.now() - 60_000).toISOString()
    const { error } = await admin.from('website_monitoring_settings').insert({
      website_id: websiteId,
      monitoring_enabled: true,
      cadence: 'weekly',
      next_due_at: pastDue,
      notification_preference: 'none',
      run_status: overrides.runStatus ?? 'idle',
      claimed_at: overrides.claimedAt ?? null,
    })
    if (error) throw new Error(`could not enable monitoring: ${error.message}`)
  }

  describe('due-work claiming — REAL concurrent claim race', () => {
    it('CONCURRENT DUPLICATE CLAIM: two simultaneous claim attempts for the same due website result in exactly ONE winner', async () => {
      const { fetchAndClaimDueWebsites, finalizeMonitoringClaim } = await import('@/lib/monitoring/due-service')
      const { websiteId } = await createTestUserAndWebsite('https://example.com')
      await enableMonitoringDue(websiteId)

      const [resultA, resultB] = await Promise.all([fetchAndClaimDueWebsites(5), fetchAndClaimDueWebsites(5)])

      const claimedThisWebsite = [...resultA, ...resultB].filter((w) => w.websiteId === websiteId)
      expect(claimedThisWebsite).toHaveLength(1)

      // Confirm the DB itself agrees: exactly one row, now 'running', with a claim_token.
      const { data: row } = await admin.from('website_monitoring_settings').select('run_status, claim_token').eq('website_id', websiteId).single()
      expect(row?.run_status).toBe('running')
      expect(row?.claim_token).not.toBeNull()

      await finalizeMonitoringClaim(websiteId, claimedThisWebsite[0].claimToken)
    })

    it('STALE CLAIM RECOVERY: a claim held past the reclaim window becomes claimable again, and a FRESH (non-stale) claim cannot be stolen', async () => {
      const { fetchAndClaimDueWebsites } = await import('@/lib/monitoring/due-service')

      const { websiteId: staleWebsiteId } = await createTestUserAndWebsite('https://example.com')
      const staleClaimedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 minutes ago > 15-minute stale threshold
      await enableMonitoringDue(staleWebsiteId, { runStatus: 'running', claimedAt: staleClaimedAt })

      const { websiteId: freshWebsiteId } = await createTestUserAndWebsite('https://example.com')
      const freshClaimedAt = new Date(Date.now() - 60 * 1000).toISOString() // 1 minute ago — well within the window
      await enableMonitoringDue(freshWebsiteId, { runStatus: 'running', claimedAt: freshClaimedAt })

      const claimed = await fetchAndClaimDueWebsites(10)
      const claimedIds = claimed.map((w) => w.websiteId)

      expect(claimedIds).toContain(staleWebsiteId)
      expect(claimedIds).not.toContain(freshWebsiteId)
    })
  })

  describe('monitoring_events — REAL idempotent insertion', () => {
    it('CONCURRENT DUPLICATE EVENT GENERATION: two simultaneous attempts to record the same (website, crawl_run) event produce exactly ONE row', async () => {
      const { createMeaningfulChangeEvent } = await import('@/lib/monitoring/event-service')
      const { websiteId } = await createTestUserAndWebsite('https://example.com')

      const { data: crawlRun, error: crawlRunError } = await admin
        .from('crawl_runs')
        .insert({ website_id: websiteId, status: 'completed', requested_page_budget: 30, effective_page_budget: 30, completed_at: new Date().toISOString() })
        .select('id')
        .single()
      if (crawlRunError || !crawlRun) throw new Error(`could not create test crawl_run: ${crawlRunError?.message}`)

      const summary = {
        previousCrawlRunId: 'prev',
        currentCrawlRunId: crawlRun.id,
        previousCompletedAt: null,
        currentCompletedAt: new Date().toISOString(),
        overallHealth: { previousScore: 80, currentScore: 90, delta: 10, comparability: 'comparable' as const },
        pillarDeltas: [],
        findingChanges: [],
        counts: { new: 0, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: 0 },
      }

      const [eventA, eventB] = await Promise.all([
        createMeaningfulChangeEvent({ websiteId, currentCrawlRunId: crawlRun.id, previousCrawlRunId: crawlRun.id, summary, reasons: ['overall_health_improved'] }),
        createMeaningfulChangeEvent({ websiteId, currentCrawlRunId: crawlRun.id, previousCrawlRunId: crawlRun.id, summary, reasons: ['overall_health_improved'] }),
      ])

      expect(eventA.id).toBe(eventB.id)

      const { count } = await admin.from('monitoring_events').select('id', { count: 'exact', head: true }).eq('website_id', websiteId).eq('current_crawl_run_id', crawlRun.id)
      expect(count).toBe(1)
    })
  })

  describe('monitoring_deliveries — REAL claim concurrency, no duplicate send attempts', () => {
    it('CONCURRENT DELIVERY CLAIMS: only one of two simultaneous processPendingDeliveries passes actually attempts the same pending delivery', async () => {
      const { createMeaningfulChangeEvent } = await import('@/lib/monitoring/event-service')
      const { createDeliveryForEvent, processPendingDeliveries } = await import('@/lib/monitoring/delivery-service')
      const { websiteId } = await createTestUserAndWebsite('https://example.com')

      const { data: crawlRun } = await admin
        .from('crawl_runs')
        .insert({ website_id: websiteId, status: 'completed', requested_page_budget: 30, effective_page_budget: 30, completed_at: new Date().toISOString() })
        .select('id')
        .single()

      const summary = {
        previousCrawlRunId: 'prev',
        currentCrawlRunId: crawlRun!.id,
        previousCompletedAt: null,
        currentCompletedAt: new Date().toISOString(),
        overallHealth: { previousScore: null, currentScore: null, delta: null, comparability: 'not_comparable' as const },
        pillarDeltas: [],
        findingChanges: [],
        counts: { new: 1, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: 0 },
      }

      const event = await createMeaningfulChangeEvent({ websiteId, currentCrawlRunId: crawlRun!.id, previousCrawlRunId: crawlRun!.id, summary, reasons: ['new_high_severity_finding'] })
      await createDeliveryForEvent(event.id, 'email')

      const [resultA, resultB] = await Promise.all([processPendingDeliveries(20), processPendingDeliveries(20)])
      expect(resultA.attempted + resultB.attempted).toBe(1)

      const { data: delivery } = await admin.from('monitoring_deliveries').select('attempt_count, status').eq('event_id', event.id).single()
      // No real provider is configured in this test environment (RESEND_EMAIL_API_KEY
      // is intentionally never set here), so the attempt honestly fails — the
      // property under test is that it was attempted EXACTLY once, never twice.
      expect(delivery?.attempt_count).toBe(1)
      expect(delivery?.status).toBe('failed')
    })

    it('PRODUCTION-VS-LOCAL SAFETY: an unconfigured NEXT_PUBLIC_APP_URL fails the delivery honestly rather than sending a broken relative link', async () => {
      const { createMeaningfulChangeEvent } = await import('@/lib/monitoring/event-service')
      const { createDeliveryForEvent, processPendingDeliveries } = await import('@/lib/monitoring/delivery-service')
      const { websiteId } = await createTestUserAndWebsite('https://example.com')

      expect(process.env.NEXT_PUBLIC_APP_URL).toBeUndefined()

      const { data: crawlRun } = await admin
        .from('crawl_runs')
        .insert({ website_id: websiteId, status: 'completed', requested_page_budget: 30, effective_page_budget: 30, completed_at: new Date().toISOString() })
        .select('id')
        .single()

      const summary = {
        previousCrawlRunId: 'prev',
        currentCrawlRunId: crawlRun!.id,
        previousCompletedAt: null,
        currentCompletedAt: new Date().toISOString(),
        overallHealth: { previousScore: null, currentScore: null, delta: null, comparability: 'not_comparable' as const },
        pillarDeltas: [],
        findingChanges: [],
        counts: { new: 1, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: 0 },
      }

      const event = await createMeaningfulChangeEvent({ websiteId, currentCrawlRunId: crawlRun!.id, previousCrawlRunId: crawlRun!.id, summary, reasons: ['new_high_severity_finding'] })
      await createDeliveryForEvent(event.id, 'email')
      await processPendingDeliveries(20)

      const { data: delivery } = await admin.from('monitoring_deliveries').select('status, last_error').eq('event_id', event.id).single()
      expect(delivery?.status).toBe('failed')
      expect(delivery?.last_error).toContain('NEXT_PUBLIC_APP_URL')
    })
  })

  describe('RLS — REAL cross-user isolation', () => {
    it('CROSS-USER LEAKAGE: an authenticated user cannot read another user’s monitoring_events row, but can read their own', async () => {
      const { createMeaningfulChangeEvent } = await import('@/lib/monitoring/event-service')
      const ownerA = await createTestUserAndWebsite('https://example.com')
      const ownerB = await createTestUserAndWebsite('https://example.com')

      const { data: crawlRun } = await admin
        .from('crawl_runs')
        .insert({ website_id: ownerA.websiteId, status: 'completed', requested_page_budget: 30, effective_page_budget: 30, completed_at: new Date().toISOString() })
        .select('id')
        .single()

      const summary = {
        previousCrawlRunId: 'prev',
        currentCrawlRunId: crawlRun!.id,
        previousCompletedAt: null,
        currentCompletedAt: new Date().toISOString(),
        overallHealth: { previousScore: null, currentScore: null, delta: null, comparability: 'not_comparable' as const },
        pillarDeltas: [],
        findingChanges: [],
        counts: { new: 1, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: 0 },
      }
      const event = await createMeaningfulChangeEvent({ websiteId: ownerA.websiteId, currentCrawlRunId: crawlRun!.id, previousCrawlRunId: crawlRun!.id, summary, reasons: ['new_high_severity_finding'] })

      const { data: sessionB } = await admin.auth.admin.generateLink({ type: 'magiclink', email: (await admin.auth.admin.getUserById(ownerB.userId)).data.user!.email! })
      // generateLink alone does not authenticate a client; instead sign in
      // directly as each owner via a password session, which exercises the
      // REAL `authenticated` role and RLS policies (not the service role).
      const clientB = createSupabaseJsClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY)
      const signInB = await clientB.auth.signInWithPassword({ email: (await admin.auth.admin.getUserById(ownerB.userId)).data.user!.email!, password: 'Test-Password-123!' })
      expect(signInB.error).toBeNull()
      void sessionB

      const { data: leaked, error: leakedError } = await clientB.from('monitoring_events').select('id').eq('id', event.id)
      expect(leakedError).toBeNull()
      expect(leaked).toEqual([])

      const clientA = createSupabaseJsClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY)
      const signInA = await clientA.auth.signInWithPassword({ email: (await admin.auth.admin.getUserById(ownerA.userId)).data.user!.email!, password: 'Test-Password-123!' })
      expect(signInA.error).toBeNull()

      const { data: own } = await clientA.from('monitoring_events').select('id').eq('id', event.id)
      expect(own).toEqual([{ id: event.id }])
    })
  })

  describe('REAL end-to-end monitoring cycle against a live, safe, public test URL', () => {
    it(
      'BASELINE THEN SECOND CYCLE: a real crawl of https://example.com, twice, with no fabricated change on the honest baseline cycle',
      async () => {
        const { fetchAndClaimDueWebsites } = await import('@/lib/monitoring/due-service')
        const { runMonitoringCycleForWebsite } = await import('@/lib/monitoring/monitoring-run')

        const { websiteId } = await createTestUserAndWebsite('https://example.com')
        await enableMonitoringDue(websiteId)

        // Cycle 1 — baseline. No subscription row exists for this test user,
        // so entitlements resolve to Free — reconcileCadenceWithEntitlements
        // will therefore DISABLE monitoring rather than run an unentitled
        // scan (exactly the real, correct behavior). To exercise a REAL
        // crawl end-to-end we grant this test user a real Bloom subscription
        // row first, precisely mirroring what a real paying customer's
        // account looks like.
        await admin.from('subscriptions').insert({ user_id: (await admin.from('websites').select('user_id').eq('id', websiteId).single()).data!.user_id, plan_key: 'bloom', status: 'active' })

        const claimed1 = await fetchAndClaimDueWebsites(5)
        const mine1 = claimed1.find((w) => w.websiteId === websiteId)
        expect(mine1).toBeDefined()

        await runMonitoringCycleForWebsite(mine1!, Date.now() + 90_000)

        const { data: afterCycle1 } = await admin.from('website_monitoring_settings').select('run_status, last_run_status, last_monitored_crawl_run_id, next_due_at').eq('website_id', websiteId).single()
        expect(afterCycle1?.run_status).toBe('idle')
        expect(afterCycle1?.last_run_status).toBe('success')
        expect(afterCycle1?.last_monitored_crawl_run_id).not.toBeNull()

        const { count: eventsAfterCycle1 } = await admin.from('monitoring_events').select('id', { count: 'exact', head: true }).eq('website_id', websiteId)
        expect(eventsAfterCycle1).toBe(0) // BASELINE — no comparison possible, no fabricated event.

        // Simulate a full cadence interval elapsing before cycle 2.
        await admin.from('website_monitoring_settings').update({ next_due_at: new Date(Date.now() - 60_000).toISOString() }).eq('website_id', websiteId)

        const claimed2 = await fetchAndClaimDueWebsites(5)
        const mine2 = claimed2.find((w) => w.websiteId === websiteId)
        expect(mine2).toBeDefined()

        await runMonitoringCycleForWebsite(mine2!, Date.now() + 90_000)

        const { data: afterCycle2 } = await admin.from('website_monitoring_settings').select('run_status, last_run_status, last_monitored_crawl_run_id').eq('website_id', websiteId).single()
        expect(afterCycle2?.run_status).toBe('idle')
        expect(afterCycle2?.last_run_status).toBe('success')
        expect(afterCycle2?.last_monitored_crawl_run_id).not.toBe(afterCycle1?.last_monitored_crawl_run_id)

        const { count: crawlRunCount } = await admin.from('crawl_runs').select('id', { count: 'exact', head: true }).eq('website_id', websiteId)
        expect(crawlRunCount).toBe(2)

        // Any event from cycle 2 (real network jitter can legitimately move
        // Performance's timing-based checks between two live fetches) must
        // be internally consistent — reasons present whenever an event
        // exists — never asserted to be exactly zero, since that would be
        // asserting away the real world rather than testing honesty.
        const { data: cycle2Events } = await admin.from('monitoring_events').select('reasons').eq('website_id', websiteId)
        for (const row of cycle2Events ?? []) {
          expect((row.reasons as unknown[]).length).toBeGreaterThan(0)
        }
      },
      120_000
    )
  })
})
