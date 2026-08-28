import type { ReactNode } from 'react'
import type { FixabilityResult } from '@/lib/fixes/fixability'
import { FIXABILITY_LABELS, FIXABILITY_ICON } from './report-helpers'

/**
 * The one obvious "what happens if I click" area for an issue. Heading comes
 * from FIXABILITY_LABELS (assisted/manual/unavailable only — never an
 * AI-vs-deterministic claim the backend doesn't make). Supporting text is
 * the real evaluateFixability() reason string already produced server-side
 * — e.g. "Connect WordPress to let Website Care assist with this
 * automatically" or "Canonical tags require manual review..." — rather than
 * generic copy invented here, so the explanation always matches actual
 * backend state. `children` (the existing PrepareFixButton wiring) is only
 * ever passed for the 'assisted' level; manual/unavailable never render a
 * button, per the no-disabled-buttons rule.
 */
export default function IssueActionPanel({
  fixability,
  children,
}: {
  fixability: FixabilityResult
  children?: ReactNode
}) {
  const Icon = FIXABILITY_ICON[fixability.level]

  return (
    <div className="mt-4 rounded-md border border-border bg-surface-muted p-3">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{FIXABILITY_LABELS[fixability.level]}</p>
          <p className="mt-0.5 text-xs text-muted">{fixability.reason}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  )
}
