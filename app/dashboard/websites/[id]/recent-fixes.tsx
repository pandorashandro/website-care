import { getRecentFixHistory, isRollbackEligibleByShape } from './fix-history'
import UndoFixButton from './undo-fix-button'
import UndoMetaFixButton from './undo-meta-fix-button'

const VERIFICATION_LABELS: Record<string, string> = {
  verified: 'Verified',
  pending: 'Pending',
  still_detected: 'Still detected',
  mismatch: 'Needs attention',
  unavailable: 'Could not verify',
}

const VERIFICATION_BADGE_CLASS: Record<string, string> = {
  verified: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  still_detected: 'bg-amber-50 text-amber-700',
  mismatch: 'bg-amber-50 text-amber-700',
  unavailable: 'bg-gray-100 text-gray-500',
}

const UNKNOWN_VERIFICATION_BADGE_CLASS = 'bg-gray-100 text-gray-500'

function formatPagePath(pageUrl: string): string {
  try {
    const { pathname, search } = new URL(pageUrl)
    const path = `${pathname}${search}`
    return path === '' ? '/' : path
  } catch {
    return pageUrl
  }
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Read-only "Recent Fixes" panel for the report page. Fetches only the
 * current, already ownership-verified website's own fix_history rows (see
 * getRecentFixHistory) — never all fixes, never another website's.
 */
export default async function RecentFixes({ websiteId }: { websiteId: string }) {
  const fixes = await getRecentFixHistory(websiteId)

  if (fixes.length === 0) return null

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Recent Fixes</h2>

      <div className="mt-3 space-y-3">
        {fixes.map((fix) => (
          <div key={fix.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{fix.issue_title}</p>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  VERIFICATION_BADGE_CLASS[fix.verification_status] ?? UNKNOWN_VERIFICATION_BADGE_CLASS
                }`}
              >
                {VERIFICATION_LABELS[fix.verification_status] ?? 'Unknown'}
              </span>
            </div>

            <p className="mt-0.5 font-mono text-xs text-gray-500">{formatPagePath(fix.page_url)}</p>

            <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              <div>
                <span className="text-gray-400">Before: </span>
                <span className="text-gray-700">
                  {fix.previous_value ? `"${fix.previous_value}"` : '(none)'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">After: </span>
                <span className="text-gray-700">{`"${fix.applied_value}"`}</span>
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-400">{formatDateTime(fix.created_at)}</p>

            {isRollbackEligibleByShape(fix) && fix.field === 'title' && (
              <UndoFixButton
                websiteId={websiteId}
                fixHistoryId={fix.id}
                previousValue={fix.previous_value ?? ''}
                appliedValue={fix.applied_value}
              />
            )}

            {isRollbackEligibleByShape(fix) && fix.field === 'meta_description' && (
              <UndoMetaFixButton
                websiteId={websiteId}
                fixHistoryId={fix.id}
                previousValue={fix.previous_value ?? ''}
                appliedValue={fix.applied_value}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
