import type { OverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import type { DashboardWebsiteStatus } from '@/components/dashboard/website-card'

/**
 * Sprint 3, Prompt 2B — pure, extracted so the Dashboard's canonical-data
 * fix (reading the same Overall Website Health Website Overview shows,
 * instead of the legacy `scans` table) has a directly testable decision
 * point, matching this codebase's own established "test the pure logic
 * directly" convention (e.g. app/dashboard/websites/[id]/fix-these-first.ts's
 * own buildFixTheseFirst split).
 */
export function deriveDashboardWebsiteStatus(crawlRun: { status: string } | null, overallHealth: OverallWebsiteHealth): DashboardWebsiteStatus {
  if (crawlRun && (crawlRun.status === 'queued' || crawlRun.status === 'running')) return 'scanning'
  if (crawlRun?.status === 'failed') return 'failed'
  if (overallHealth.score !== null) return 'analyzed'
  if (crawlRun) return 'scanning'
  return 'not_scanned'
}
