'use client'

import { useActionState, useState } from 'react'
import { disconnectWordPress, type DisconnectWordPressState } from './wordpress-actions'

const initialState: DisconnectWordPressState = null

export default function DisconnectWordPressButton({ websiteId }: { websiteId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(disconnectWordPress, initialState)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Disconnect WordPress
      </button>
    )
  }

  return (
    <form action={formAction} className="mt-4 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
      <input type="hidden" name="websiteId" value={websiteId} />

      <p className="text-xs text-gray-600">
        This removes the stored connection from Website Care. It does not necessarily revoke the
        Application Password inside WordPress — you can also revoke it from your WordPress admin
        area.
      </p>

      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? 'Disconnecting…' : 'Yes, disconnect'}
        </button>
      </div>
    </form>
  )
}
