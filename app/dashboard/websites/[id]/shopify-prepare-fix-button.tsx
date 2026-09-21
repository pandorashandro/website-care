'use client'

import { useActionState, useState } from 'react'
import UpgradePrompt from '@/components/billing/upgrade-prompt'
import { buttonStyles } from '@/components/ui/button'
import {
  prepareShopifyTitleFix,
  applyShopifyTitleFix,
  type PrepareShopifyTitleFixState,
  type ApplyShopifyTitleFixState,
} from './shopify-title-fix-actions'
import {
  prepareShopifyMetaFix,
  applyShopifyMetaFix,
  type PrepareShopifyMetaFixState,
  type ApplyShopifyMetaFixState,
} from './shopify-meta-fix-actions'
import type { ShopifyPublicVerification } from '@/lib/fixes/verify-shopify-public-value'

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  product: 'Product',
  collection: 'Collection',
  page: 'Page',
  article: 'Article',
}

/**
 * Same 4-state labeling philosophy as WordPress's own VerificationResult
 * components (prepare-fix-button.tsx): a successful Admin write and a
 * verified public result are always shown as separate facts, never
 * collapsed. Shopify's verifier (lib/fixes/verify-shopify-public-value.ts)
 * only ever produces these 4 states — there is no Shopify equivalent of
 * WordPress's 'still_detected'.
 */
function ShopifyVerificationResult({ verification }: { verification: ShopifyPublicVerification }) {
  if (verification.status === 'verified') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-success">Verified ✓</p>
        <p className="mt-1 text-xs text-muted">The public storefront now reflects the fix.</p>
      </div>
    )
  }

  if (verification.status === 'pending') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-warning">Pending</p>
        <p className="mt-1 text-xs text-muted">
          The public storefront is still showing the previous value. This may be caused by caching.
        </p>
      </div>
    )
  }

  if (verification.status === 'mismatch') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-warning">Needs attention</p>
        <p className="mt-1 text-xs text-muted">
          Shopify accepted the update, but the public storefront is showing something different than
          expected.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-muted">Could not verify</p>
      <p className="mt-1 text-xs text-muted">webioom could not safely check the public storefront right now.</p>
    </div>
  )
}

const initialPrepareTitleState: PrepareShopifyTitleFixState = null
const initialApplyTitleState: ApplyShopifyTitleFixState = null
const initialPrepareMetaState: PrepareShopifyMetaFixState = null
const initialApplyMetaState: ApplyShopifyMetaFixState = null

/** True only for Title's 'ready'/'already_applied'/'admin_write_succeeded' variants — narrows the Title|Meta union via the field only Title's shape has, rather than via `fixKind` (a separate variable TS cannot correlate with the union for narrowing purposes). */
function isTitleReady(
  state: PrepareShopifyTitleFixState | PrepareShopifyMetaFixState
): state is Extract<PrepareShopifyTitleFixState, { status: 'ready' }> {
  return (state as { currentTitle?: unknown } | null)?.currentTitle !== undefined
}

/**
 * The Shopify counterpart to WordPress's PrepareFixButton, scoped to only
 * the two fix families Shopify actually has: title and meta_description
 * (never rendered for H1/Image Alt — see report-helpers.ts's fixProvider).
 * Structurally simpler than WordPress's version for one honest reason:
 * Shopify's Prepare results carry no `source: 'ai' | 'deterministic'` field
 * (see shopify-title-fix-actions.ts / shopify-meta-fix-actions.ts), so this
 * component never shows an "AI-assisted suggestion" pill — showing one
 * would be inventing data the backend doesn't return.
 *
 * `writeStatus: 'admin_write_succeeded'` always means only that the Shopify
 * Admin API confirmed the write — `verification` (Phase 20.1G) is a fully
 * separate, independently-rendered fact (verified/pending/mismatch/
 * unavailable via ShopifyVerificationResult below), and a successful write
 * whose fix_history record failed to save (`historyStatus === 'failed'`)
 * is called out explicitly rather than silently offering an Undo that
 * won't actually be available (see ActivityItem/UndoShopifyTitleFixButton/
 * UndoShopifyMetaFixButton for the Undo flow itself, which lives on the
 * Activity page and Recent Fixes widget rather than here).
 *
 * Both title and meta_description action pairs are always wired via
 * useActionState (rules of hooks — fixKind never changes for a mounted
 * instance, since each card renders exactly one issue), and only the pair
 * matching `fixKind` is ever submitted to.
 */
export default function ShopifyPrepareFixButton({
  websiteId,
  pageLabel,
  issueId,
  fixKind,
}: {
  websiteId: string
  pageLabel: string
  issueId: string
  fixKind: 'title' | 'meta_description'
}) {
  const [prepareTitleState, prepareTitleAction, prepareTitlePending] = useActionState(
    prepareShopifyTitleFix,
    initialPrepareTitleState
  )
  const [applyTitleState, applyTitleAction, applyTitlePending] = useActionState(
    applyShopifyTitleFix,
    initialApplyTitleState
  )
  const [prepareMetaState, prepareMetaAction, prepareMetaPending] = useActionState(
    prepareShopifyMetaFix,
    initialPrepareMetaState
  )
  const [applyMetaState, applyMetaAction, applyMetaPending] = useActionState(
    applyShopifyMetaFix,
    initialApplyMetaState
  )

  const prepareState: PrepareShopifyTitleFixState | PrepareShopifyMetaFixState =
    fixKind === 'title' ? prepareTitleState : prepareMetaState
  const preparePending = fixKind === 'title' ? prepareTitlePending : prepareMetaPending
  const prepareAction = fixKind === 'title' ? prepareTitleAction : prepareMetaAction
  const applyState: ApplyShopifyTitleFixState | ApplyShopifyMetaFixState =
    fixKind === 'title' ? applyTitleState : applyMetaState
  const applyPending = fixKind === 'title' ? applyTitlePending : applyMetaPending
  const applyAction = fixKind === 'title' ? applyTitleAction : applyMetaAction

  const [dismissed, setDismissed] = useState(false)
  const [handledPrepareState, setHandledPrepareState] = useState(prepareState)
  const [applyVisible, setApplyVisible] = useState(false)
  const [handledApplyState, setHandledApplyState] = useState(applyState)

  if (prepareState !== handledPrepareState) {
    setHandledPrepareState(prepareState)
    setDismissed(false)
    setApplyVisible(false)
  }

  if (applyState !== handledApplyState) {
    setHandledApplyState(applyState)
    setApplyVisible(true)
  }

  const visiblePrepareState = dismissed ? null : prepareState
  const visibleApplyState = applyVisible ? applyState : null

  return (
    <div className="mt-3">
      <form action={prepareAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="websiteId" value={websiteId} />
        <input type="hidden" name="issueId" value={issueId} />
        <button
          type="submit"
          disabled={preparePending}
          className={buttonStyles({ variant: 'outline', size: 'sm' })}
        >
          {preparePending ? 'Preparing fix…' : 'Prepare Fix'}
        </button>
        <span className="text-xs text-subtle">for {pageLabel}</span>
      </form>

      {visiblePrepareState &&
        (visiblePrepareState.status === 'ready' ? (
          <div className="mt-2 max-w-sm rounded-md border border-border bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Fix Preview</p>

            <p className="mt-2 text-xs font-medium text-muted">Shopify resource</p>
            <p className="text-sm text-gray-900">
              {RESOURCE_TYPE_LABELS[visiblePrepareState.resourceType] ?? visiblePrepareState.resourceType}
            </p>

            <p className="mt-2 text-xs font-medium text-muted">Current</p>
            <p className="text-sm text-gray-900">
              {isTitleReady(visiblePrepareState) ? (
                visiblePrepareState.currentTitle ? (
                  `“${visiblePrepareState.currentTitle}”`
                ) : (
                  <span className="text-subtle">(none)</span>
                )
              ) : visiblePrepareState.currentValue ? (
                `“${visiblePrepareState.currentValue}”`
              ) : (
                <span className="text-subtle">(none)</span>
              )}
            </p>

            <p className="mt-2 text-xs font-medium text-muted">Suggested</p>
            <p className="text-sm text-gray-900">{`“${visiblePrepareState.proposedValue}”`}</p>

            <p className="mt-2 text-xs text-muted">{visiblePrepareState.explanation}</p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className={buttonStyles({ variant: 'outline', size: 'sm' })}
              >
                Cancel
              </button>
              <form action={applyAction}>
                <input type="hidden" name="previewToken" value={visiblePrepareState.previewToken} />
                <button
                  type="submit"
                  disabled={applyPending}
                  className={buttonStyles({ variant: 'primary', size: 'sm' })}
                >
                  {applyPending ? 'Applying…' : 'Apply Fix'}
                </button>
              </form>
            </div>

            {visibleApplyState &&
              (visibleApplyState.writeStatus === 'admin_write_succeeded' ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs font-medium text-success">Fix applied successfully ✓</p>
                  <p className="mt-1 text-xs text-muted">
                    {'newTitle' in visibleApplyState
                      ? `Shopify title updated to: "${visibleApplyState.newTitle}"`
                      : `Shopify meta description updated to: "${visibleApplyState.newValue}"`}
                  </p>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-subtle">
                    Public verification
                  </p>
                  <ShopifyVerificationResult verification={visibleApplyState.verification} />

                  {visibleApplyState.historyStatus === 'failed' && (
                    <p className="mt-3 text-xs text-warning">
                      Fix applied, but webioom could not save the audit record. Undo will not be available
                      for this change.
                    </p>
                  )}
                </div>
              ) : visibleApplyState.writeStatus === 'already_applied' ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted">Already up to date</p>
                  <p className="mt-1 text-xs text-muted">
                    {'currentTitle' in visibleApplyState
                      ? `The current value in Shopify already matches: "${visibleApplyState.currentTitle}"`
                      : `The current value in Shopify already matches: "${visibleApplyState.currentValue}"`}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-danger">{visibleApplyState.reason}</p>
              ))}
          </div>
        ) : visiblePrepareState.status === 'requires_upgrade' ? (
          <UpgradePrompt
            open
            onClose={() => setDismissed(true)}
            attemptedAction={`Fix this ${fixKind === 'title' ? 'title' : 'meta description'} with webioom`}
            benefit="Upgrade to unlock guided fixes, AI-assisted improvements, Safe Fix where supported, verification and ongoing website improvement."
          />
        ) : (
          <p className="mt-2 text-xs text-muted">{visiblePrepareState.reason}</p>
        ))}
    </div>
  )
}
