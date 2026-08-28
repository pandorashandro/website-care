import { RotateCcw } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { formatPageLabel } from '@/components/report/report-helpers'
import type { FixHistoryRecord } from '@/app/dashboard/websites/[id]/fix-history'
import { isRollbackEligibleByShape } from '@/app/dashboard/websites/[id]/fix-history'
import UndoFixButton from '@/app/dashboard/websites/[id]/undo-fix-button'
import UndoMetaFixButton from '@/app/dashboard/websites/[id]/undo-meta-fix-button'
import UndoH1FixButton from '@/app/dashboard/websites/[id]/undo-h1-fix-button'
import UndoImageAltFixButton from '@/app/dashboard/websites/[id]/undo-image-alt-fix-button'
import { getActionLabel, isUndoRow, formatPreviousValue, formatDateTime, formatImageLabel, getVerificationCopy } from './activity-helpers'

/**
 * One fix_history row, translated into product language. Reuses the exact
 * same Undo components and isRollbackEligibleByShape gate the report page's
 * Recent Fixes widget already used — no rollback logic is reimplemented
 * here, and eligibility (including for rollback rows themselves, which the
 * existing gate does not exclude) behaves identically to before.
 */
export default function ActivityItem({ fix, websiteId }: { fix: FixHistoryRecord; websiteId: string }) {
  const undo = isUndoRow(fix)
  const verification = getVerificationCopy(fix.verification_status)
  const eligible = isRollbackEligibleByShape(fix)

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {undo && <RotateCcw className="h-4 w-4 text-muted" aria-hidden="true" />}
          <h3 className="text-sm font-semibold text-gray-900">{getActionLabel(fix)}</h3>
        </div>
        <Badge tone={verification.tone}>{verification.label}</Badge>
      </div>

      <div className="mt-1.5 space-y-0.5">
        <p className="truncate font-mono text-xs text-muted">Page · {formatPageLabel(fix.page_url)}</p>
        {fix.field === 'image_alt' && fix.image_url && (
          <p className="truncate font-mono text-xs text-muted">Image · {formatImageLabel(fix.image_url)}</p>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">{verification.description}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Previous</p>
          <p className="mt-0.5 text-sm text-gray-700">{formatPreviousValue(fix)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Applied</p>
          <p className="mt-0.5 text-sm text-gray-700">{`"${fix.applied_value}"`}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-subtle">{formatDateTime(fix.created_at)}</p>

      {eligible && fix.field === 'title' && (
        <UndoFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
      {eligible && fix.field === 'meta_description' && (
        <UndoMetaFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
      {eligible && fix.field === 'h1' && (
        <UndoH1FixButton websiteId={websiteId} fixHistoryId={fix.id} appliedValue={fix.applied_value} />
      )}
      {eligible && fix.field === 'image_alt' && (
        <UndoImageAltFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
    </Card>
  )
}
