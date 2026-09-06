'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanKey } from '@/lib/entitlements/plans'
import { PLAN_PRESENTATION } from '@/lib/billing/plan-presentation'
import Alert from '@/components/ui/alert'
import Button from '@/components/ui/button'

const MAX_POLL_ATTEMPTS = 8
const POLL_INTERVAL_MS = 2500

/**
 * Phase 23.3 Part 6 — the one place webioom ever tells a user "you're on
 * Bloom now," and only once the SERVER's own resolved entitlement (passed
 * down as `currentPlan`, freshly re-fetched by the billing page's own
 * Server Component on every `router.refresh()`) actually matches what
 * checkout claimed to purchase. Checkout completing in the browser is
 * never treated as authority on its own — only the verified webhook
 * updating `subscriptions` (and this component observing that change via
 * a fresh server read) is.
 *
 * Bounded, not indefinite: polls at most `MAX_POLL_ATTEMPTS` times
 * (~20 seconds total) via `router.refresh()` — the smallest reliable
 * pattern that needs no new data-fetching endpoint, since the billing
 * page's own Server Component already re-resolves entitlements on every
 * refresh. After the bound is reached, an explicit manual "Refresh"
 * action takes over rather than continuing to poll forever.
 */
export default function PostCheckoutBanner({ expectedPlan, currentPlan }: { expectedPlan: PlanKey; currentPlan: PlanKey }) {
  const router = useRouter()
  const [attempts, setAttempts] = useState(0)
  const matched = currentPlan === expectedPlan

  useEffect(() => {
    if (matched || attempts >= MAX_POLL_ATTEMPTS) return

    const timeout = setTimeout(() => {
      setAttempts((count) => count + 1)
      router.refresh()
    }, POLL_INTERVAL_MS)

    return () => clearTimeout(timeout)
  }, [matched, attempts, router])

  if (matched) {
    return (
      <Alert tone="success">
        You&apos;re on {PLAN_PRESENTATION[expectedPlan].name}. Thanks for upgrading!
      </Alert>
    )
  }

  if (attempts >= MAX_POLL_ATTEMPTS) {
    return (
      <Alert tone="info">
        <div className="flex flex-wrap items-center gap-2">
          <span>Payment received. We&apos;re still confirming your subscription — this can take a moment.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAttempts(0)
              router.refresh()
            }}
          >
            Refresh
          </Button>
        </div>
      </Alert>
    )
  }

  return (
    <Alert tone="info" role="status">
      Payment received. We&apos;re confirming your subscription…
    </Alert>
  )
}
