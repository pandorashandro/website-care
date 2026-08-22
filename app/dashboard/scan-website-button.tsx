'use client'

import { useActionState } from 'react'
import { scanWebsite, type ScanWebsiteState } from './actions'

const initialState: ScanWebsiteState = null

export default function ScanWebsiteButton({
  websiteId,
  label = 'Scan Website',
}: {
  websiteId: string
  label?: string
}) {
  const [state, formAction, pending] = useActionState(scanWebsite, initialState)

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="websiteId" value={websiteId} />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Scanning…' : label}
      </button>

      {state?.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  )
}
