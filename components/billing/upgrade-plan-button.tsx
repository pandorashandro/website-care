'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCheckoutForPlan, type CreateCheckoutState } from '@/app/dashboard/billing-actions'
import { loadPaddle, type PaddleCheckoutEvent } from '@/lib/billing/paddle-client'
import { getCheckoutErrorMessage } from '@/lib/billing/checkout-error-message'
import type { PaddlePlanKey } from '@/lib/paddle/plan-mapping'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

const initialState: CreateCheckoutState = null

type UiState = 'idle' | 'opening' | 'processing' | 'error'

/**
 * The one reusable checkout control, used on both `/pricing` and
 * `/dashboard/billing`. Flow, matching this phase's explicit security and
 * UX requirements:
 *
 * 1. Submits ONLY `plan` (a trusted plan key) — `createCheckoutForPlan`
 *    (Phase 23.2) resolves the price ID and binds this session's own user
 *    id server-side; nothing else is ever sent to the server from here.
 * 2. On success, loads Paddle.js (if needed) and opens the checkout
 *    overlay via `transactionId` ONLY — never re-supplying `items` or
 *    `customData` client-side, which would reopen exactly the "browser-
 *    controlled custom_data" hole the server-side transaction creation
 *    exists to close.
 * 3. `checkout.completed` never grants anything by itself — it only
 *    shows an honest "we're confirming" message and navigates to the
 *    billing page, which is the one place that reflects the verified
 *    subscription state once the webhook has actually landed.
 * 4. `checkout.closed` without a prior `checkout.completed` is a plain
 *    cancellation — resets to idle, no error shown.
 *
 * State derivation is split deliberately: the purely-local reaction to a
 * new server-action result (idle -> error, idle -> opening) happens
 * during render, mirroring app/dashboard/add-website-button.tsx's own
 * "compare to the last-handled state" pattern already used throughout
 * this codebase, rather than inside an effect — an effect exists only for
 * the genuine external I/O (loading Paddle.js, opening the overlay),
 * whose own setState calls all happen inside async continuations
 * (`.then`/`.catch`/the Paddle event callback), never synchronously in the
 * effect body itself.
 */
export default function UpgradePlanButton({ plan, label }: { plan: PaddlePlanKey; label: string }) {
  // NEXT_PUBLIC_* variables are inlined at build time in both server and
  // client bundles, so this is read directly here rather than threaded
  // through as a prop from every call site (`/pricing`, `/dashboard/billing`).
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? null
  const router = useRouter()
  const [state, formAction, pending] = useActionState(createCheckoutForPlan, initialState)
  const [uiState, setUiState] = useState<UiState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [handledState, setHandledState] = useState(state)

  if (state !== handledState) {
    setHandledState(state)

    if (state && !state.ok) {
      setUiState('error')
      setErrorMessage(getCheckoutErrorMessage(state.reason))
    } else if (state && state.ok && !clientToken) {
      setUiState('error')
      setErrorMessage('Checkout is not available right now. Please try again shortly.')
    } else if (state && state.ok) {
      setUiState('opening')
    }
  }

  useEffect(() => {
    if (!state || !state.ok || !clientToken) return

    let cancelled = false

    loadPaddle(clientToken, (event: PaddleCheckoutEvent) => {
      if (event.name === 'checkout.completed') {
        setUiState('processing')
        router.push(`/dashboard/billing?checkout=${plan}`)
      }
      if (event.name === 'checkout.closed') {
        setUiState((current) => (current === 'processing' ? current : 'idle'))
      }
    })
      .then((paddle) => {
        if (!cancelled) paddle.Checkout.open({ transactionId: state.transactionId })
      })
      .catch(() => {
        if (!cancelled) {
          setUiState('error')
          setErrorMessage('Checkout is not available right now. Please try again shortly.')
        }
      })

    return () => {
      cancelled = true
    }
    // router is stable across renders; state/clientToken/plan are the real
    // dependencies this effect reacts to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, clientToken, plan])

  if (uiState === 'processing') {
    return (
      <p className="text-sm text-muted" role="status">
        Payment received. We&apos;re confirming your subscription…
      </p>
    )
  }

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="plan" value={plan} />
        <Button type="submit" disabled={pending || uiState === 'opening'} className="w-full">
          {pending ? 'Preparing checkout…' : uiState === 'opening' ? 'Opening checkout…' : label}
        </Button>
      </form>
      {uiState === 'error' && errorMessage && (
        <Alert tone="danger" className="mt-2">
          {errorMessage}
        </Alert>
      )}
    </div>
  )
}
