'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { addWebsite, type AddWebsiteState } from './actions'

const initialState: AddWebsiteState = null

export default function AddWebsiteButton() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(addWebsite, initialState)
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
        className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        + Add Website
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-900">Add a website</h2>

            <form ref={formRef} action={formAction} className="mt-4 space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Website name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  placeholder="My Website"
                />
              </div>

              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700">
                  Website URL
                </label>
                <input
                  id="url"
                  name="url"
                  type="url"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  placeholder="https://example.com"
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
                  {pending ? 'Adding…' : 'Add Website'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
