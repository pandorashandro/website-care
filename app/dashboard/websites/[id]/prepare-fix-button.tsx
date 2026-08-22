'use client'

import { useActionState } from 'react'
import { prepareFix, type PrepareFixState } from './wordpress-fix-actions'

const initialState: PrepareFixState = null

export default function PrepareFixButton({
  websiteId,
  pageUrl,
  pageLabel,
}: {
  websiteId: string
  pageUrl: string
  pageLabel: string
}) {
  const [state, formAction, pending] = useActionState(prepareFix, initialState)

  return (
    <div className="mt-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="websiteId" value={websiteId} />
        <input type="hidden" name="pageUrl" value={pageUrl} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? 'Checking…' : 'Prepare Fix'}
        </button>
        <span className="text-xs text-gray-400">for {pageLabel}</span>
      </form>

      {state && (
        <p className="mt-2 text-xs text-gray-600">
          {state.status === 'mapped'
            ? `WordPress ${state.resourceType} identified.`
            : state.status === 'unmapped'
              ? `Content mapping required — ${state.reason}`
              : `Could not check WordPress right now — ${state.reason}`}
        </p>
      )}
    </div>
  )
}
