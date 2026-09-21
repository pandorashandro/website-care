'use client'

import { useState, type ReactNode } from 'react'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import Tabs from '@/components/ui/tabs'
import { SEVERITY_LABELS, severityTone } from '@/components/report/report-helpers'

/** Same severity → color mapping as Fix These First's left-edge accent — one visual language for "how urgent is this" across the whole product, not a per-page invention. */
const SEVERITY_EDGE: Record<NormalizedFinding['severity'], string> = {
  critical: 'var(--color-danger)',
  high: 'var(--color-danger)',
  medium: 'var(--color-warning)',
  low: 'var(--color-border-strong)',
}

/**
 * Sprint 3, Prompt 2B — Section 15/16. The ONE coherent finding +
 * Simple/Expert presentation, shared by every pillar report. Each page's
 * own Server Component still runs its own existing Supabase queries
 * unchanged (different tables, different evidence shapes per engine) and
 * maps its own finding rows into this shared `NormalizedFinding` shape —
 * this component only ever renders what it's given, never fetches or
 * reclassifies anything itself. `evidence` is pre-rendered JSX built
 * server-side (each pillar's own existing instance-row markup, untouched)
 * so no pillar-specific data shape needs to cross the server/client
 * boundary as raw props — only the already-rendered result does, which
 * this component simply shows or hides.
 *
 * The Simple/Expert preference is plain component state (Section 15
 * explicitly permits this — "session/local UI state... do not add a
 * migration merely for this preference") — it resets on reload by design,
 * not persisted, and never changes which findings exist or what they say,
 * only how much of the SAME data is visible at once.
 */
export type NormalizedFinding = {
  id: string
  categoryLabel: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  actionabilityLabel: string
  actionabilityTone: BadgeTone
  /** Plain-language impact — always shown, in both views. */
  whyItMatters: string
  /** Kept out of Simple View's default reading path (it's genuine technical guidance, not "why this matters to a business owner") but still just one click away, never removed. */
  recommendation: string
  /** Optional — not every pillar's findings carry a confidence rating. */
  confidenceLabel?: string
  /** e.g. "3 source pages · 12 occurrences" — already formatted server-side by each pillar's own existing countsSummary helper. */
  countsSummary: string
  /** Pre-rendered instance/evidence markup (URLs, current/desired state, proposed change) — Expert View only. */
  evidence?: ReactNode
  /**
   * A real remediation control (Prepare Fix button etc.) for the primary
   * affected instance, when one genuinely exists — shown in BOTH Simple
   * and Expert views, never hidden behind progressive disclosure. Simple
   * View's entire purpose is "what should I do next," so the one real
   * action a finding supports must stay reachable there — only the
   * technical EVIDENCE justifying it (every other affected URL, exact
   * current/desired values) is Expert-only.
   */
  primaryAction?: ReactNode
}

const VIEW_ITEMS = [
  { value: 'simple' as const, label: 'Simple' },
  { value: 'expert' as const, label: 'Expert' },
]

function FindingCard({ finding, expert }: { finding: NormalizedFinding; expert: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hasEvidence = !!finding.evidence

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface">
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: SEVERITY_EDGE[finding.severity] }} aria-hidden="true" />
      <div className="p-4 pl-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{finding.categoryLabel}</p>
            <h3 className="mt-0.5 text-base font-semibold text-gray-900">{finding.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(finding.severity)}>{SEVERITY_LABELS[finding.severity]}</Badge>
            {expert && finding.confidenceLabel && <Badge tone="neutral">{finding.confidenceLabel}</Badge>}
          </div>
        </div>

        <p className="mt-1.5 text-xs font-medium text-muted">{finding.countsSummary}</p>

        <p className="mt-2.5 text-sm text-gray-700">{finding.whyItMatters}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge tone={finding.actionabilityTone}>{finding.actionabilityLabel}</Badge>
          {expert && hasEvidence && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-xs font-medium text-brand transition-colors duration-150 ease-out hover:text-brand-hover"
              aria-expanded={expanded}
            >
              {expanded ? 'Hide evidence' : 'Show evidence'}
            </button>
          )}
        </div>

        {finding.primaryAction && <div className="mt-3">{finding.primaryAction}</div>}

        {expert && (
          <div className="mt-3 border-t border-border pt-3 text-sm text-gray-700">
            <p>
              <span className="font-semibold text-gray-900">Recommendation: </span>
              {finding.recommendation}
            </p>
            {expanded && hasEvidence && <div className="mt-3">{finding.evidence}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function FindingList({ findings }: { findings: NormalizedFinding[] }) {
  const [view, setView] = useState<'simple' | 'expert'>('simple')

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {view === 'simple' ? 'Plain-language priorities — switch to Expert for technical evidence.' : 'Full technical detail for every finding.'}
        </p>
        <Tabs items={VIEW_ITEMS} value={view} onChange={setView} aria-label="Simple or Expert view" />
      </div>

      <div className="mt-4 space-y-4">
        {findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} expert={view === 'expert'} />
        ))}
      </div>
    </div>
  )
}
