'use client'

import { useActionState, useState } from 'react'
import { prepareFix, type PrepareFixState } from './wordpress-fix-actions'

const initialState: PrepareFixState = null

export default function PrepareFixButton({
  websiteId,
  pageUrl,
  pageLabel,
  issueTitle,
}: {
  websiteId: string
  pageUrl: string
  pageLabel: string
  issueTitle: string
}) {
  const [state, formAction, pending] = useActionState(prepareFix, initialState)
  const [dismissed, setDismissed] = useState(false)
  const [handledState, setHandledState] = useState(state)

  if (state !== handledState) {
    setHandledState(state)
    setDismissed(false) // a fresh result should always be shown, even if a previous one was dismissed
  }

  const visibleState = dismissed ? null : state

  return (
    <div className="mt-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="websiteId" value={websiteId} />
        <input type="hidden" name="pageUrl" value={pageUrl} />
        <input type="hidden" name="issueTitle" value={issueTitle} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? 'Checking…' : 'Prepare Fix'}
        </button>
        <span className="text-xs text-gray-400">for {pageLabel}</span>
      </form>

      {visibleState &&
        (visibleState.status === 'ready' ? (
          <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fix Preview</p>

            <p className="mt-2 text-xs font-medium text-gray-500">Current</p>
            {/* Plain JSX text interpolation only — React escapes this by
                default. WordPress content is never rendered via
                dangerouslySetInnerHTML anywhere in this feature. */}
            <p className="text-sm text-gray-900">
              {visibleState.currentValue ? (
                `“${visibleState.currentValue}”`
              ) : (
                <span className="text-gray-400">(none)</span>
              )}
            </p>

            <p className="mt-2 text-xs font-medium text-gray-500">Proposed</p>
            <p className="text-sm text-gray-900">{`“${visibleState.proposedValue}”`}</p>

            <p className="mt-2 text-xs text-gray-500">{visibleState.explanation}</p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled
                title="Applying fixes is coming in a future phase."
                className="cursor-not-allowed rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400"
              >
                Apply Fix — coming next
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-600">{visibleState.reason}</p>
        ))}
    </div>
  )
}
