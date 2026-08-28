import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { healthLabel, healthTone } from '@/lib/scanner/health-label'

export default function HealthOverview({
  overall,
  issueCount,
  pageCount,
}: {
  overall: number
  issueCount: number
  pageCount: number
}) {
  return (
    <Card padding="md">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Overall Website Health</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-semibold tracking-tight text-gray-900">{overall}</span>
        <span className="text-base text-muted">/ 100</span>
        <Badge tone={healthTone(overall)} className="text-sm">
          {healthLabel(overall)}
        </Badge>
      </div>

      <p className="mt-3 text-sm text-muted">Your health score summarizes the findings from the latest scan.</p>

      <p className="mt-2 text-sm text-muted">
        {issueCount} issue{issueCount === 1 ? '' : 's'} found
        {pageCount > 0 && (
          <>
            {' '}
            across {pageCount} page{pageCount === 1 ? '' : 's'}
          </>
        )}
      </p>
    </Card>
  )
}
