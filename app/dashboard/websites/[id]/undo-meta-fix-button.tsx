'use client'

import { useActionState, useState } from 'react'
import { buttonStyles } from '@/components/ui/button'
import { rollbackMetaDescriptionFix, type RollbackMetaDescriptionFixState } from './wordpress-meta-rollback-actions'

const initialState: RollbackMetaDescriptionFixState = null

const VERIFICATION_LABELS: Record<string, string> = {
  verified: 'Verified',
  pending: 'Pending',
  mismatch: 'Needs attention',
  unavailable: 'Could not verify',
}

/** Mirrors undo-fix-button.tsx exactly, routed to the meta-description rollback action. */
export default function UndoMetaFixButton({
  websiteId,
  fixHistoryId,
  previousValue,
  appliedValue,
}: {
  websiteId: string
  fixHistoryId: string
  previousValue: string
  appliedValue: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(rollbackMetaDescriptionFix, initialState)

  if (state && state.rollbackWriteStatus === 'success') {
    return (
      <div className="mt-2 border-t border-border pt-2">
        <p className="text-xs font-medium text-success">Rollback applied ✓</p>
        <p className="mt-1 text-xs text-muted">
          Verification:{' '}
          {VERIFICATION_LABELS[state.verification.status] ?? 'Unknown'}
        </p>
        {state.historyStatus === 'failed' && (
          <p className="mt-1 text-xs text-warning">
            Rollback applied, but webioom could not save the audit record.
          </p>
        )}
      </div>
    )
  }

  if (state && state.rollbackWriteStatus === 'failed') {
    return (
      <div className="mt-2 border-t border-border pt-2">
        <p className="text-xs text-danger">{state.reason}</p>
      </div>
    )
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2 text-xs font-medium text-muted underline hover:text-muted"
      >
        Undo
      </button>
    )
  }

  return (
    <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold text-gray-900">Undo this change?</p>

      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-subtle">
        Current webioom change
      </p>
      <p className="mt-1 text-xs font-medium text-muted">Before</p>
      <p className="text-sm text-gray-900">{previousValue ? `"${previousValue}"` : '(empty description)'}</p>
      <p className="mt-1 text-xs font-medium text-muted">After</p>
      <p className="text-sm text-gray-900">{`"${appliedValue}"`}</p>

      <p className="mt-3 text-xs font-medium text-muted">Rollback would restore</p>
      <p className="text-sm text-gray-900">{previousValue ? `"${previousValue}"` : '(empty description)'}</p>

      <form action={formAction} className="mt-3 flex gap-2">
        <input type="hidden" name="websiteId" value={websiteId} />
        <input type="hidden" name="fixHistoryId" value={fixHistoryId} />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className={buttonStyles({ variant: 'outline', size: 'sm' })}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {pending ? 'Undoing…' : 'Confirm Undo'}
        </button>
      </form>
    </div>
  )
}
