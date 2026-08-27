'use client'

import { useActionState, useState } from 'react'
import { prepareFix, applyFix, type PrepareFixState, type ApplyFixState } from './wordpress-fix-actions'
import { applyMetaDescriptionFix, type ApplyMetaDescriptionFixState } from './wordpress-meta-fix-actions'
import type { TitleFixVerification } from '@/lib/fixes/verify-title-fix'
import type { MetaDescriptionFixVerification } from '@/lib/fixes/verify-meta-description-fix'
import type { SeoMetadataProviderResult } from '@/lib/integrations/wordpress/seo-provider'
import type { H1SourceDetectionResult } from '@/lib/fixes/h1-source-detection'

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
      <p className="mt-2 text-xs text-gray-500">{provider.reason}</p>
    </div>
  )
}

const H1_SOURCE_LABELS: Record<string, string> = {
  gutenberg: 'Gutenberg',
  classic_html: 'Classic Editor / HTML',
}

/**
 * Read-only diagnostic — deliberately shows no Apply Fix button and no AI
 * suggestion. Phase 15.3A only determines whether an H1 issue can be
 * confidently traced to the page's own editable WordPress content; it
 * never reads/writes an H1 itself yet.
 */
function H1SourceDiagnostic({ result }: { result: H1SourceDetectionResult }) {
  // 'supported' only ever reaches this component for multiple_h1 — a
  // supported missing_h1 result is routed to the AI 'ready' preview instead.
  if (result.status === 'supported') {
    return (
      <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-500">H1 source</p>
        <p className="text-sm text-gray-900">WordPress page content</p>

        <p className="mt-2 text-xs text-gray-500">
          Website Care identified multiple H1 headings in editable content.
        </p>

        <p className="mt-2 text-xs font-medium text-gray-500">Detected</p>
        <ul className="mt-1 space-y-0.5">
          {result.publicH1s.map((heading, index) => (
            <li key={index} className="text-sm text-gray-900">
              {`— ${heading}`}
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs font-medium text-amber-700">Guided fix</p>
        <p className="mt-1 text-xs text-gray-500">
          Website Care will not automatically choose which heading to remove yet.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2 max-w-sm rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">H1 source</p>
      <p className="text-sm text-gray-900">Not safely identified</p>
      <p className="mt-2 text-xs text-gray-500">{result.reason}</p>
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

/** Same labeling philosophy as VerificationResult, for meta descriptions. */
function MetaDescriptionVerificationResult({ verification }: { verification: MetaDescriptionFixVerification }) {
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
          The public page is still serving the previous meta description. This may be caused by caching.
        </p>
      </div>
    )
  }

  if (verification.status === 'mismatch') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-amber-700">Needs attention</p>
        <p className="mt-1 text-xs text-gray-600">
          WordPress accepted the update, but the public page is displaying a different meta description.
        </p>
      </div>
    )
  }

  if (verification.status === 'still_detected') {
    return (
      <div className="mt-1">
        <p className="text-xs font-medium text-amber-700">Needs attention</p>
        <p className="mt-1 text-xs text-gray-600">
          The public page does not yet reflect a meta description that resolves the original issue.
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

const initialApplyMetaDescriptionState: ApplyMetaDescriptionFixState = null

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
  const [applyMetaState, applyMetaFormAction, applyMetaPending] = useActionState(
    applyMetaDescriptionFix,
    initialApplyMetaDescriptionState
  )
  const [dismissed, setDismissed] = useState(false)
  const [handledState, setHandledState] = useState(state)
  const [applyStateVisible, setApplyStateVisible] = useState(false)
  const [handledApplyState, setHandledApplyState] = useState(applyState)
  const [applyMetaStateVisible, setApplyMetaStateVisible] = useState(false)
  const [handledApplyMetaState, setHandledApplyMetaState] = useState(applyMetaState)

  if (state !== handledState) {
    setHandledState(state)
    setDismissed(false) // a fresh result should always be shown, even if a previous one was dismissed
    setApplyStateVisible(false) // a fresh prepare result hides any stale apply outcome from a previous attempt
    setApplyMetaStateVisible(false)
  }

  if (applyState !== handledApplyState) {
    setHandledApplyState(applyState)
    setApplyStateVisible(true) // a fresh apply result is always shown
  }

  if (applyMetaState !== handledApplyMetaState) {
    setHandledApplyMetaState(applyMetaState)
    setApplyMetaStateVisible(true)
  }

  const visibleState = dismissed ? null : state
  const visibleApplyState = applyStateVisible ? applyState : null
  const visibleApplyMetaState = applyMetaStateVisible ? applyMetaState : null

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

            {visibleState.field === 'meta_description' && (
              <>
                <p className="mt-2 text-xs font-medium text-gray-500">SEO provider</p>
                <p className="text-sm text-gray-900">{SEO_PROVIDER_LABELS[visibleState.provider] ?? visibleState.provider}</p>
              </>
            )}

            {visibleState.field === 'h1' && (
              <>
                <p className="mt-2 text-xs font-medium text-gray-500">H1 source</p>
                <p className="text-sm text-gray-900">WordPress page content</p>
                <p className="mt-2 text-xs font-medium text-gray-500">Editor</p>
                <p className="text-sm text-gray-900">{H1_SOURCE_LABELS[visibleState.editorSource] ?? visibleState.editorSource}</p>
              </>
            )}

            <p className="mt-2 text-xs font-medium text-gray-500">Current</p>
            {/* Plain JSX text interpolation only — React escapes this by
                default. WordPress content is never rendered via
                dangerouslySetInnerHTML anywhere in this feature. */}
            <p className="text-sm text-gray-900">
              {visibleState.field === 'h1' ? (
                <span className="text-gray-400">No H1 found</span>
              ) : visibleState.currentValue ? (
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

            {visibleState.field === 'title' ? (
              <>
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
              </>
            ) : visibleState.field === 'meta_description' ? (
              <>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <form action={applyMetaFormAction}>
                    <input type="hidden" name="previewToken" value={visibleState.previewToken} />
                    <button
                      type="submit"
                      disabled={applyMetaPending}
                      className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {applyMetaPending ? 'Applying…' : 'Apply Fix'}
                    </button>
                  </form>
                </div>

                {visibleApplyMetaState &&
                  (visibleApplyMetaState.writeStatus === 'success' ? (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <p className="text-xs font-medium text-green-700">Fix applied successfully ✓</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {`Meta description updated to: “${visibleApplyMetaState.appliedMetaDescription}”`}
                      </p>

                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Verification
                      </p>
                      <MetaDescriptionVerificationResult verification={visibleApplyMetaState.verification} />

                      {visibleApplyMetaState.historyStatus === 'failed' && (
                        <p className="mt-3 text-xs text-amber-700">
                          Fix applied, but Website Care could not save the audit record.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-red-600">{visibleApplyMetaState.reason}</p>
                  ))}
              </>
            ) : (
              // H1 preview (Phase 15.3B): read-only by design. No Apply Fix
              // button — no H1 write path exists yet.
              <div className="mt-3 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ) : visibleState.status === 'diagnostic' ? (
          visibleState.field === 'meta_description' ? (
            <SeoProviderDiagnostic provider={visibleState.provider} />
          ) : (
            <H1SourceDiagnostic result={visibleState.result} />
          )
        ) : (
          <p className="mt-2 text-xs text-gray-600">{visibleState.reason}</p>
        ))}
    </div>
  )
}
