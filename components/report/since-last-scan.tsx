import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { formatDate, severityTone, SEVERITY_LABELS } from '@/components/report/report-helpers'
import { CANONICAL_PILLAR_LABELS } from '@/lib/monitoring/types'
import type { LatestChangeResult } from '@/app/dashboard/websites/[id]/scan-history'
import { sortFindingChangesBySeverity, type FindingChange } from '@/lib/monitoring/compare'

/**
 * Sprint 2, Prompt 1 — MONITORING FOUNDATION, Step 9. The one customer-facing
 * surface for canonical change intelligence — built entirely from
 * `getLatestChangeSummary`'s already-computed, deterministic ChangeSummary
 * (see lib/monitoring/compare.ts). This component makes NO comparison
 * decisions of its own: it only labels and orders values it is handed.
 *
 * Three genuinely different states, never collapsed into one another:
 * - `no_scans`: nothing to show — the caller simply doesn't render this card.
 * - `baseline_only`: exactly one completed scan exists. An honest "Baseline
 *   created" message — never a fabricated comparison.
 * - `compared`: a real previous/current pair exists.
 */

const MAX_LISTED = 5

function formatDelta(delta: number | null): string {
  if (delta === null) return ''
  if (delta > 0) return `+${delta}`
  return `${delta}`
}

function FindingRow({ change }: { change: FindingChange }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-sm text-gray-700">{change.title}</span>
      <Badge tone={severityTone(change.severity)} className="shrink-0">
        {SEVERITY_LABELS[change.severity]}
      </Badge>
    </li>
  )
}

export default function SinceLastScan({ result }: { result: LatestChangeResult }) {
  if (result.status === 'no_scans') return null

  if (result.status === 'baseline_only') {
    return (
      <Card padding="md">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Since Last Scan</p>
        <p className="mt-2 text-sm text-gray-700">
          Baseline created from your scan on {formatDate(result.scan.completedAt ?? new Date().toISOString())}. Future scans
          will show what changed.
        </p>
      </Card>
    )
  }

  const { summary } = result
  const { overallHealth, pillarDeltas, findingChanges, counts } = summary

  const needsAttention = sortFindingChangesBySeverity(findingChanges.filter((c) => c.state === 'new' || c.state === 'worsened')).slice(0, MAX_LISTED)
  const improved = sortFindingChangesBySeverity(findingChanges.filter((c) => c.state === 'resolved' || c.state === 'improved')).slice(0, MAX_LISTED)
  const stillOpen = sortFindingChangesBySeverity(findingChanges.filter((c) => c.state === 'persistent')).slice(0, MAX_LISTED)

  const comparablePillarDeltas = pillarDeltas.filter((d) => d.comparability === 'comparable' && d.delta !== null && d.delta !== 0)

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Since Last Scan</p>
        <p className="text-xs text-muted">
          {summary.previousCompletedAt && formatDate(summary.previousCompletedAt)} → {summary.currentCompletedAt && formatDate(summary.currentCompletedAt)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {overallHealth.comparability === 'comparable' ? (
          <p className="text-lg font-semibold text-gray-900">
            Health {overallHealth.previousScore} → {overallHealth.currentScore}{' '}
            <span className={overallHealth.delta! >= 0 ? 'text-success' : 'text-danger'}>({formatDelta(overallHealth.delta)})</span>
          </p>
        ) : (
          <p className="text-sm text-muted">Overall Health movement is not comparable between these two scans.</p>
        )}
      </div>

      {comparablePillarDeltas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {comparablePillarDeltas.map((d) => (
            <span key={d.pillar} className={`text-sm ${d.delta! >= 0 ? 'text-success' : 'text-danger'}`}>
              {CANONICAL_PILLAR_LABELS[d.pillar]} {formatDelta(d.delta)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {counts.new > 0 && <Badge tone="danger">{counts.new} new issue{counts.new === 1 ? '' : 's'}</Badge>}
        {counts.resolved > 0 && <Badge tone="success">{counts.resolved} resolved</Badge>}
        {counts.persistent > 0 && <Badge tone="neutral">{counts.persistent} still need attention</Badge>}
        {counts.worsened > 0 && <Badge tone="warning">{counts.worsened} worsened</Badge>}
        {counts.improved > 0 && <Badge tone="info">{counts.improved} improved</Badge>}
      </div>

      {counts.unverified > 0 && (
        <p className="mt-2 text-xs text-muted">
          {counts.unverified} finding{counts.unverified === 1 ? '' : 's'} from the previous scan could not be verified this
          time (the relevant page or category wasn&apos;t re-analyzed) — not counted as fixed.
        </p>
      )}

      {(needsAttention.length > 0 || improved.length > 0 || stillOpen.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {needsAttention.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Needs Attention</h3>
              <ul className="mt-1 divide-y divide-border">
                {needsAttention.map((c) => (
                  <FindingRow key={c.fingerprint} change={c} />
                ))}
              </ul>
            </div>
          )}

          {improved.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Improved</h3>
              <ul className="mt-1 divide-y divide-border">
                {improved.map((c) => (
                  <FindingRow key={c.fingerprint} change={c} />
                ))}
              </ul>
            </div>
          )}

          {stillOpen.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Still Open</h3>
              <ul className="mt-1 divide-y divide-border">
                {stillOpen.map((c) => (
                  <FindingRow key={c.fingerprint} change={c} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
