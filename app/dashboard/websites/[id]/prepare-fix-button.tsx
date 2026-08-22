'use client'

import { useActionState } from 'react'
import { prepareFix, type PrepareFixState } from './wordpress-fix-actions'
import { extractCurrentValueForIssue } from '@/lib/fixes/current-value'

const initialState: PrepareFixState = null
const MAX_VALUE_LENGTH = 120

function truncate(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value
}

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

  const currentValue = state?.status === 'loaded' ? extractCurrentValueForIssue(issueTitle, state) : null

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
        <div className="mt-2 text-xs text-gray-600">
          {state.status === 'loaded' ? (
            <div className="space-y-1">
              <p>WordPress {state.resourceType} identified. Current content loaded.</p>
              {currentValue?.available ? (
                // Plain JSX text interpolation only — React escapes this by
                // default. WordPress content is never rendered via
                // dangerouslySetInnerHTML anywhere in this feature.
                <p>
                  <span className="font-medium text-gray-700">{currentValue.label}: </span>
                  <span className="font-mono">&ldquo;{truncate(currentValue.value)}&rdquo;</span>
                </p>
              ) : currentValue ? (
                <p className="text-gray-400">{currentValue.reason}</p>
              ) : null}
            </div>
          ) : state.status === 'stale_mapping' ? (
            <p>{state.reason}</p>
          ) : state.status === 'unavailable' ? (
            <p>Content mapping required — {state.reason}</p>
          ) : (
            <p>Could not check WordPress right now — {state.reason}</p>
          )}
        </div>
      )}
    </div>
  )
}
