import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import {
  type DecoratedIssue,
  SEVERITY_LABELS,
  severityTone,
  FIXABILITY_LABELS,
  fixabilityTone,
  FIXABILITY_ICON,
  formatCategory,
} from './report-helpers'

const PRIORITY_TEXT_CLASS: Record<string, string> = {
  Urgent: 'text-red-700',
  'High Priority': 'text-orange-700',
  'Medium Priority': 'text-amber-700',
  'Low Priority': 'text-muted',
}

/**
 * Read-only summary of the same top-priority findings the report already
 * ranks (aggregateIssues' own priorityScore/priorityLabel — no ranking logic
 * lives here). Deliberately does not render PrepareFixButton — each item
 * links to its full card in the Detailed Report below, where the actual fix
 * entry point lives, so this section stays scannable rather than repeating
 * the whole workflow three times.
 */
export default function PriorityIssues({ issues }: { issues: DecoratedIssue[] }) {
  if (issues.length === 0) return null

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">Needs your attention</h2>
      <p className="mt-1 text-sm text-muted">The findings most worth addressing first, out of everything in this report.</p>

      <div className="mt-4 space-y-3">
        {issues.map((issue, index) => {
          const ActionIcon = FIXABILITY_ICON[issue.fixability.level]

          return (
          <Card key={issue.anchorId} padding="sm" className="flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <a href={`#${issue.anchorId}`} className="text-sm font-semibold text-gray-900 hover:text-brand">
                {issue.title}
              </a>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Badge tone={severityTone(issue.severity)}>{SEVERITY_LABELS[issue.severity] ?? issue.severity}</Badge>
                <span className={`font-medium ${PRIORITY_TEXT_CLASS[issue.priorityLabel] ?? 'text-muted'}`}>
                  {issue.priorityLabel}
                </span>
                <span className="text-subtle">·</span>
                <span className="text-muted">{formatCategory(issue.type)}</span>
                <span className="text-subtle">·</span>
                <span className="text-muted">
                  {issue.affectedPageCount} page{issue.affectedPageCount === 1 ? '' : 's'} affected
                  {issue.homepageAffected ? ' · includes homepage' : ''}
                </span>
              </div>

              <p className="mt-2 text-sm text-gray-700">{issue.recommendation}</p>

              <div className="mt-2 flex items-center gap-2">
                <Badge tone={fixabilityTone(issue.fixability.level)}>
                  <ActionIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                  {FIXABILITY_LABELS[issue.fixability.level]}
                </Badge>
                <a href={`#${issue.anchorId}`} className="text-xs font-medium text-brand hover:text-brand-hover">
                  View details
                </a>
              </div>
            </div>
          </Card>
          )
        })}
      </div>
    </div>
  )
}
