'use client'

import { useActionState, useState } from 'react'
import UpgradePrompt from '@/components/billing/upgrade-prompt'
import { buttonStyles } from '@/components/ui/button'
import {
  prepareWixTitleFix,
  applyWixTitleFix,
  type PrepareWixTitleFixState,
  type ApplyWixTitleFixState,
} from './wix-title-fix-actions'
import {
  prepareWixMetaFix,
  applyWixMetaFix,
  type PrepareWixMetaFixState,
  type ApplyWixMetaFixState,
} from './wix-meta-fix-actions'
import type { WixPublicVerification } from '@/lib/fixes/verify-wix-public-value'

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  blog_post: 'Blog Post',
  stores_product: 'Store Product',
}

/**
 * Same 4-state labeling philosophy as Shopify's own ShopifyVerificationResult
 * (shopify-prepare-fix-button.tsx): a successful Wix Admin write and a
 * verified public result are always shown as separate facts, never
 * collapsed. Wix's verifier (lib/fixes/verify-wix-public-value.ts) produces
 * the same 4 states Shopify's does (verified/pending/mismatch/unavailable).
 */
function WixVerificationResult({ verification }: { verification: WixPublicVerification }) {
  if (verification.status === 'verified') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-success">Verified ✓</p>
        <p className="mt-1 text-xs text-muted">The public site now reflects the fix.</p>
      </div>
    )
  }

  if (verification.status === 'pending') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-warning">Pending</p>
        <p className="mt-1 text-xs text-muted">
          The public site is still showing the previous value. This may be caused by caching.
        </p>
      </div>
    )
  }

  if (verification.status === 'mismatch') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-warning">Needs attention</p>
        <p className="mt-1 text-xs text-muted">
          Wix accepted the update, but the public site is showing something different than expected.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-muted">Could not verify</p>
      <p className="mt-1 text-xs text-muted">webioom could not safely check the public site right now.</p>
    </div>
  )
}

const initialPrepareTitleState: PrepareWixTitleFixState = null
const initialApplyTitleState: ApplyWixTitleFixState = null
const initialPrepareMetaState: PrepareWixMetaFixState = null
const initialApplyMetaState: ApplyWixMetaFixState = null

/** True only for Title's 'ready' variant — narrows the Title|Meta union via the field only Title's shape has, rather than via `fixKind` (a separate variable TS cannot correlate with the union for narrowing purposes). */
function isTitleReady(
  state: PrepareWixTitleFixState | PrepareWixMetaFixState
): state is Extract<PrepareWixTitleFixState, { status: 'ready' }> {
  return (state as { currentTitle?: unknown } | null)?.currentTitle !== undefined
}

/**
 * The Wix counterpart to ShopifyPrepareFixButton, scoped to only the two fix
 * families Wix actually supports directly: title and meta_description
 * (never rendered for H1/Image Alt/Static Page — see report-helpers.ts's
 * fixProvider and lib/integrations/wix/issue-fixability.ts). Mirrors
 * shopify-prepare-fix-button.tsx's structure exactly, including the same
 * separation between `writeStatus: 'admin_write_succeeded'` (only means the
 * Wix Admin API confirmed the write) and `verification` (a fully separate,
 * independently-rendered fact), and the same historyStatus === 'failed'
 * callout when Undo won't be available for a successful write.
 */
export default function WixPrepareFixButton({
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
    prepareWixTitleFix,
    initialPrepareTitleState
  )
  const [applyTitleState, applyTitleAction, applyTitlePending] = useActionState(
    applyWixTitleFix,
    initialApplyTitleState
  )
  const [prepareMetaState, prepareMetaAction, prepareMetaPending] = useActionState(
    prepareWixMetaFix,
    initialPrepareMetaState
  )
  const [applyMetaState, applyMetaAction, applyMetaPending] = useActionState(
    applyWixMetaFix,
    initialApplyMetaState
  )

  const prepareState: PrepareWixTitleFixState | PrepareWixMetaFixState =
    fixKind === 'title' ? prepareTitleState : prepareMetaState
  const preparePending = fixKind === 'title' ? prepareTitlePending : prepareMetaPending
  const prepareAction = fixKind === 'title' ? prepareTitleAction : prepareMetaAction
  const applyState: ApplyWixTitleFixState | ApplyWixMetaFixState =
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

            <p className="mt-2 text-xs font-medium text-muted">Wix resource</p>
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
                      ? `Wix title updated to: "${visibleApplyState.newTitle}"`
                      : `Wix meta description updated to: "${visibleApplyState.newValue}"`}
                  </p>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-subtle">
                    Public verification
                  </p>
                  <WixVerificationResult verification={visibleApplyState.verification} />

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
                      ? `The current value in Wix already matches: "${visibleApplyState.currentTitle}"`
                      : `The current value in Wix already matches: "${visibleApplyState.currentValue}"`}
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
