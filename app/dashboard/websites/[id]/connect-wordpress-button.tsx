'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { connectWordPress, type ConnectWordPressState } from './wordpress-actions'

const initialState: ConnectWordPressState = null

export default function ConnectWordPressButton({ websiteId }: { websiteId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(connectWordPress, initialState)
  const [handledState, setHandledState] = useState(state)
  const formRef = useRef<HTMLFormElement>(null)

  if (state !== handledState) {
    setHandledState(state)

    if (state !== null && !state.error) {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (state !== null && !state.error) {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Connect WordPress
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-900">Connect WordPress</h2>
            <p className="mt-1 text-sm text-gray-500">
              Use a WordPress Application Password, not your normal WordPress password.
            </p>

            <form ref={formRef} action={formAction} className="mt-4 space-y-4">
              <input type="hidden" name="websiteId" value={websiteId} />

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  WordPress Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="off"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="applicationPassword" className="block text-sm font-medium text-gray-700">
                  WordPress Application Password
                </label>
                <input
                  id="applicationPassword"
                  name="applicationPassword"
                  type="password"
                  autoComplete="off"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                />
              </div>

              {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {pending ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
