'use client'

import Link from 'next/link'
import Modal from '@/components/ui/modal'
import UpgradePlanButton from '@/components/billing/upgrade-plan-button'
import { PLAN_PRESENTATION } from '@/lib/billing/plan-presentation'
import type { PaddlePlanKey } from '@/lib/paddle/plan-mapping'

export type UpgradePromptProps = {
  open: boolean
  onClose: () => void
  /** Overrides the default "Ready to fix this?" heading — useful for a future non-fix premium action (e.g. connecting an integration, monitoring). */
  title?: string
  /** Plain-language description of what the customer just tried to do, e.g. "Apply this fix with webioom". */
  attemptedAction: string
  /** Why upgrading specifically helps with THIS attempted action — kept concrete, never generic filler. */
  benefit: string
  /** The plan that unlocks this capability. Defaults to Bloom, the entry paid tier. */
  requiredPlan?: PaddlePlanKey
}

/**
 * Free-scan -> paid funnel task — the ONE reusable component for the "you
 * just attempted a paid capability" moment. Rendered by the WordPress/
 * Shopify/Wix prepare-fix buttons whenever their server action responds
 * with a `requires_upgrade`/entitlement-denied result (see e.g.
 * app/dashboard/websites/[id]/wordpress-fix-actions.ts's `prepareFix`) —
 * never rendered speculatively or on a timer, only in direct reaction to a
 * real attempt, per this task's "contextually when the user demonstrates
 * intent" requirement.
 *
 * Never a dark pattern: explains exactly what was attempted, why upgrading
 * helps for that specific thing, which plan unlocks it and its real price,
 * and is always easy to dismiss (Modal's own Escape/backdrop-click/X
 * behavior — no forced choice). The primary action embeds the SAME
 * `UpgradePlanButton` already used on `/pricing` and `/dashboard/billing`
 * (not a new checkout path) so clicking "Upgrade to Bloom" opens the real
 * Paddle checkout overlay directly from here; "View all plans" is a plain
 * link for a visitor who wants to compare tiers first.
 *
 * Frontend-only by construction — it never grants anything itself. Every
 * capability it fronts is independently, authoritatively enforced
 * server-side by `canUseAiFix`/`canUseDirectFix` (lib/entitlements/
 * service.ts), which is what actually protects the fix-execution actions;
 * this modal only explains a denial that already happened (or, for a
 * proactive future call site, WOULD happen) — it is never itself the
 * security boundary.
 */
export default function UpgradePrompt({
  open,
  onClose,
  title = 'Ready to fix this?',
  attemptedAction,
  benefit,
  requiredPlan = 'bloom',
}: UpgradePromptProps) {
  const plan = PLAN_PRESENTATION[requiredPlan]

  return (
    <Modal open={open} onClose={onClose} title={title} description={`You just tried: ${attemptedAction}`}>
      <p className="text-sm text-gray-700">{benefit}</p>

      <div className="mt-4 rounded-md border border-border bg-surface-muted p-3">
        <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
        <p className="text-sm text-gray-700">
          {plan.priceLabel} · {plan.maxWebsites} website{plan.maxWebsites === 1 ? '' : 's'}
        </p>
      </div>

      <div className="mt-5 space-y-2">
        <UpgradePlanButton plan={requiredPlan} label={`Upgrade to ${plan.name}`} />
        <Link href="/pricing" className="block text-center text-sm font-medium text-muted hover:text-gray-700">
          View all plans
        </Link>
      </div>
    </Modal>
  )
}
