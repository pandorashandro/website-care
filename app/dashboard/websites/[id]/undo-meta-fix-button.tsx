'use client'

import { useActionState, useState } from 'react'
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
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="text-xs font-medium text-green-700">Rollback applied ✓</p>
        <p className="mt-1 text-xs text-gray-600">
          Verification:{' '}
          {VERIFICATION_LABELS[state.verification.status] ?? 'Unknown'}
        </p>
        {state.historyStatus === 'failed' && (
          <p className="mt-1 text-xs text-amber-700">
            Rollback applied, but Website Care could not save the audit record.
          </p>
        )}
      </div>
    )
  }

  if (state && state.rollbackWriteStatus === 'failed') {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="text-xs text-red-600">{state.reason}</p>
      </div>
    )
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2 text-xs font-medium text-gray-500 underline hover:text-gray-700"
      >
        Undo
      </button>
    )
  }

  return (
    <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold text-gray-900">Undo this change?</p>

      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        Current Website Care change
      </p>
      <p className="mt-1 text-xs font-medium text-gray-500">Before</p>
      <p className="text-sm text-gray-900">{previousValue ? `"${previousValue}"` : '(empty description)'}</p>
      <p className="mt-1 text-xs font-medium text-gray-500">After</p>
      <p className="text-sm text-gray-900">{`"${appliedValue}"`}</p>

      <p className="mt-3 text-xs font-medium text-gray-500">Rollback would restore</p>
      <p className="text-sm text-gray-900">{previousValue ? `"${previousValue}"` : '(empty description)'}</p>

      <form action={formAction} className="mt-3 flex gap-2">
        <input type="hidden" name="websiteId" value={websiteId} />
        <input type="hidden" name="fixHistoryId" value={fixHistoryId} />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
