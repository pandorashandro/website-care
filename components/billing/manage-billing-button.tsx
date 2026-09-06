'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createBillingPortalSession, type CreatePortalSessionState } from '@/app/dashboard/billing-actions'
import { getPortalErrorMessage } from '@/lib/billing/checkout-error-message'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

const initialState: CreatePortalSessionState = null

/**
 * Wraps `createBillingPortalSession` (Phase 23.2) — the browser submits no
 * arguments at all (no customer ID), matching that action's own contract;
 * `useActionState` calling it with `(prevState, formData)` is harmless
 * since a function is always safely callable with extra arguments it
 * doesn't declare. On success, redirects the whole page to Paddle's
 * hosted portal — this never reimplements Paddle's own billing-management
 * UI inside webioom.
 */
export default function ManageBillingButton() {
  const [state, formAction, pending] = useActionState(createBillingPortalSession, initialState)
  const handledStateRef = useRef(state)

  useEffect(() => {
    if (state === handledStateRef.current) return
    handledStateRef.current = state

    if (state?.ok) {
      window.location.href = state.url
    }
  }, [state])

  return (
    <div>
      <form action={formAction}>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? 'Opening billing…' : 'Manage billing'}
        </Button>
      </form>
      {state && !state.ok && (
        <Alert tone="danger" className="mt-2">
          {getPortalErrorMessage(state.reason)}
        </Alert>
      )}
    </div>
  )
}
