import Link from 'next/link'
import { getRecentFixHistory } from './fix-history'
import ActivityItem from '@/components/activity/activity-item'

const OVERVIEW_PREVIEW_LIMIT = 3

/**
 * Compact "Recent Activity" preview for the Website Overview page — fetches
 * only the current, already ownership-verified website's own fix_history
 * rows (see getRecentFixHistory), and reuses the exact same ActivityItem
 * presentation as the full Activity page rather than a second, divergent
 * rendering. The full history lives at /dashboard/websites/[id]/activity.
 */
export default async function RecentFixes({ websiteId }: { websiteId: string }) {
  const fixes = await getRecentFixHistory(websiteId, OVERVIEW_PREVIEW_LIMIT)

  if (fixes.length === 0) return null

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
        <Link href={`/dashboard/websites/${websiteId}/activity`} className="text-sm font-medium text-brand hover:text-brand-hover">
          View all activity
        </Link>
      </div>

      <div className="mt-3 space-y-3">
        {fixes.map((fix) => (
          <ActivityItem key={fix.id} fix={fix} websiteId={websiteId} />
        ))}
      </div>
    </div>
  )
}
