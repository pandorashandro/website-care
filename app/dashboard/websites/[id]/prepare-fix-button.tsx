'use client'

import { useActionState, useState } from 'react'
import { prepareFix, applyFix, type PrepareFixState, type ApplyFixState } from './wordpress-fix-actions'
import type { TitleFixVerification } from '@/lib/fixes/verify-title-fix'
import type { SeoMetadataProviderResult } from '@/lib/integrations/wordpress/seo-provider'

const SEO_PROVIDER_LABELS: Record<string, string> = {
  yoast: 'Yoast SEO',
  rank_math: 'Rank Math',
  aioseo: 'AIOSEO',
}

/**
 * Read-only diagnostic — deliberately shows no Apply Fix button. Phase
 * 15.2A only detects/maps which SEO plugin (if any) controls this page's
 * metadata; it never reads/writes a meta description itself yet.
 */
function SeoProviderDiagnostic({ provider }: { provider: SeoMetadataProviderResult }) {
  if (provider.status === 'detected') {
    return (
      <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-500">SEO provider</p>
        <p className="text-sm text-gray-900">{SEO_PROVIDER_LABELS[provider.provider] ?? provider.provider}</p>

        <p className="mt-2 text-xs font-medium text-gray-500">
          {provider.writable ? 'Meta description' : 'Editable metadata'}
        </p>
        <p className="text-sm text-gray-900">
          {provider.writable ? 'Available' : 'Not exposed through supported REST API'}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">SEO provider</p>
      <p className="text-sm text-gray-900">Not confirmed</p>
      <p className="mt-2 text-xs text-gray-500">Website Care cannot safely map this meta description yet.</p>
    </div>
  )
}

const initialPrepareState: PrepareFixState = null
const initialApplyState: ApplyFixState = null

/**
 * A successful WordPress write and a verified public fix are separate
 * facts — this only ever labels the verification outcome, and never claims
 * "Issue resolved" unless status is exactly 'verified'.
 */
function VerificationResult({ verification }: { verification: TitleFixVerification }) {
  if (verification.status === 'verified') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-green-700">Verified ✓</p>
        <p className="mt-1 text-xs text-gray-600">The public page now reflects the fix.</p>
      </div>
    )
  }

  if (verification.status === 'pending') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-amber-700">Pending</p>
        <p className="mt-1 text-xs text-gray-600">
          The public page is still serving the previous title. This may be caused by caching.
        </p>
      </div>
    )
  }

  if (verification.status === 'mismatch') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-amber-700">Needs attention</p>
        <p className="mt-1 text-xs text-gray-600">
          WordPress accepted the title update, but the public page is displaying a different title.
        </p>
      </div>
    )
  }

  if (verification.status === 'still_detected') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-amber-700">Needs attention</p>
        <p className="mt-1 text-xs text-gray-600">
          The public page does not yet reflect a title that resolves the original issue.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-gray-500">Could not verify</p>
      <p className="mt-1 text-xs text-gray-600">Website Care could not safely check the public page right now.</p>
    </div>
  )
}

export default function PrepareFixButton({
  websiteId,
  pageUrl,
  pageLabel,
  issueTitle,
}: {
  websiteId: string
  pageUrl: string
  pageLabel: string
  issueTitle: string
}) {
  const [state, formAction, pending] = useActionState(prepareFix, initialPrepareState)
  const [applyState, applyFormAction, applyPending] = useActionState(applyFix, initialApplyState)
  const [dismissed, setDismissed] = useState(false)
  const [handledState, setHandledState] = useState(state)
  const [applyStateVisible, setApplyStateVisible] = useState(false)
  const [handledApplyState, setHandledApplyState] = useState(applyState)

  if (state !== handledState) {
    setHandledState(state)
    setDismissed(false) // a fresh result should always be shown, even if a previous one was dismissed
    setApplyStateVisible(false) // a fresh prepare result hides any stale apply outcome from a previous attempt
  }

  if (applyState !== handledApplyState) {
    setHandledApplyState(applyState)
    setApplyStateVisible(true) // a fresh apply result is always shown
  }

  const visibleState = dismissed ? null : state
  const visibleApplyState = applyStateVisible ? applyState : null

  return (
    <div className="mt-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="websiteId" value={websiteId} />
        <input type="hidden" name="pageUrl" value={pageUrl} />
        <input type="hidden" name="issueTitle" value={issueTitle} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? 'Checking…' : 'Prepare Fix'}
        </button>
        <span className="text-xs text-gray-400">for {pageLabel}</span>
      </form>

      {visibleState &&
        (visibleState.status === 'ready' ? (
          <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fix Preview</p>

            <p className="mt-2 text-xs font-medium text-gray-500">Current</p>
            {/* Plain JSX text interpolation only — React escapes this by
                default. WordPress content is never rendered via
                dangerouslySetInnerHTML anywhere in this feature. */}
            <p className="text-sm text-gray-900">
              {visibleState.currentValue ? (
                `“${visibleState.currentValue}”`
              ) : (
                <span className="text-gray-400">(none)</span>
              )}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-gray-500">Suggested</p>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                {visibleState.source === 'ai' ? 'AI-assisted suggestion' : 'Standard suggestion'}
              </span>
            </div>
            <p className="text-sm text-gray-900">{`“${visibleState.proposedValue}”`}</p>

            <p className="mt-2 text-xs text-gray-500">{visibleState.explanation}</p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <form action={applyFormAction}>
                <input type="hidden" name="previewToken" value={visibleState.previewToken} />
                <button
                  type="submit"
                  disabled={applyPending}
                  className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {applyPending ? 'Applying…' : 'Apply Fix'}
                </button>
              </form>
            </div>

            {visibleApplyState &&
              (visibleApplyState.writeStatus === 'success' ? (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <p className="text-xs font-medium text-green-700">Fix applied successfully ✓</p>
                  <p className="mt-1 text-xs text-gray-600">
                    {`WordPress title updated to: “${visibleApplyState.appliedTitle}”`}
                  </p>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Verification
                  </p>
                  <VerificationResult verification={visibleApplyState.verification} />

                  {visibleApplyState.historyStatus === 'failed' && (
                    <p className="mt-3 text-xs text-amber-700">
                      Fix applied, but Website Care could not save the audit record.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-red-600">{visibleApplyState.reason}</p>
              ))}
          </div>
        ) : visibleState.status === 'diagnostic' ? (
          <SeoProviderDiagnostic provider={visibleState.provider} />
        ) : (
          <p className="mt-2 text-xs text-gray-600">{visibleState.reason}</p>
        ))}
    </div>
  )
}
