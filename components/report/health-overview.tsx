import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { healthLabel, healthTone } from '@/lib/scanner/health-label'

/**
 * Unified webioom engine — this card previously carried the "Overall
 * Website Health" label using the legacy single-homepage-page scan's own
 * score. That label now belongs exclusively to
 * components/report/overall-website-health.tsx's canonical, multi-category
 * aggregation (see lib/category-engine/overall-health.ts). This component
 * still summarizes the SAME legacy homepage scan's findings — genuinely
 * useful detail for the issue list rendered below it — just honestly
 * scoped to what it actually is: one page's worth of checks, not the
 * website's overall health.
 */
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
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Homepage Scan Summary</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-semibold tracking-tight text-gray-900">{overall}</span>
        <span className="text-base text-muted">/ 100</span>
        <Badge tone={healthTone(overall)} className="text-sm">
          {healthLabel(overall)}
        </Badge>
      </div>

      <p className="mt-3 text-sm text-muted">This score summarizes findings from your homepage scan — see Overall Website Health above for your site-wide result.</p>

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
