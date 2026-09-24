import type { OverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import type { DashboardWebsiteStatus } from '@/components/dashboard/website-card'

/**
 * Sprint 3, Prompt 2B — pure, extracted so the Dashboard's canonical-data
 * fix (reading the same Overall Website Health Website Overview shows,
 * instead of the legacy `scans` table) has a directly testable decision
 * point, matching this codebase's own established "test the pure logic
 * directly" convention (e.g. app/dashboard/websites/[id]/fix-these-first.ts's
 * own buildFixTheseFirst split).
 *
 * Scoring Engine V1 contract (2026-09-24, see docs/scoring-contract-v1.md):
 * `overallHealth.score` is now `null` far more often than before — WITHHELD
 * whenever fewer than all seven pillars are fully, adequately evidenced,
 * not only when literally nothing has been analyzed yet. This function must
 * therefore distinguish two previously-conflated cases:
 *
 *   - a crawl that finished with SOME real pillar evidence but not a
 *     complete, fully-supported set (`'limited'` — a settled, honest
 *     end-state, matching the same "Limited analysis" wording Website
 *     Overview shows);
 *   - a crawl that hasn't produced ANY pillar evidence yet at all
 *     (`'scanning'` — analysis genuinely still in progress, exactly the
 *     window between the crawl finishing and category analysis running).
 */
export function deriveDashboardWebsiteStatus(crawlRun: { status: string } | null, overallHealth: OverallWebsiteHealth): DashboardWebsiteStatus {
  if (crawlRun && (crawlRun.status === 'queued' || crawlRun.status === 'running')) return 'scanning'
  if (crawlRun?.status === 'failed') return 'failed'
  if (overallHealth.score !== null) return 'analyzed'
  if (crawlRun && overallHealth.contributingCategoryCount > 0) return 'limited'
  if (crawlRun) return 'scanning'
  return 'not_scanned'
}
