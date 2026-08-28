import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'

/**
 * Purely illustrative marketing content — fixed numbers, never fetched from
 * Supabase or any live scan. Exists only to visually demonstrate the shape
 * of a real Website Care report (health score, categories, priority,
 * affected page, fix state) using the actual design system, not a
 * screenshot. The "Example report" label keeps it honest in the UI itself,
 * not just in this comment.
 */
const DEMO_CATEGORIES = [
  { label: 'SEO', score: 92 },
  { label: 'Technical', score: 84 },
  { label: 'Accessibility', score: 78 },
  { label: 'Performance', score: 81 },
  { label: 'Content', score: 90 },
]

const DEMO_OVERALL_SCORE = 87

function barColor(score: number): string {
  if (score >= 90) return 'bg-green-500'
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ProductPreview() {
  return (
    <div>
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-subtle">
        Example report — not a live scan
      </p>

      <Card className="mx-auto max-w-md" padding="md">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Website Health</h3>
          <p className="text-2xl font-semibold text-gray-900">
            {DEMO_OVERALL_SCORE}
            <span className="text-sm font-normal text-muted"> / 100</span>
          </p>
        </div>

        <div className="mt-4 space-y-2.5">
          {DEMO_CATEGORIES.map((category) => (
            <div key={category.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700">{category.label}</span>
                <span className="text-muted">{category.score}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className={`h-full rounded-full ${barColor(category.score)}`} style={{ width: `${category.score}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Needs attention</p>

          <div className="mt-3 rounded-md border border-border bg-surface-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">High priority</Badge>
              <Badge tone="brand">AI-assisted fix available</Badge>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-900">Missing meta description</p>
            <p className="font-mono text-xs text-muted">/services</p>

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="mt-3 w-full cursor-default rounded-md border border-blue-300 bg-brand-subtle px-3 py-1.5 text-xs font-medium text-brand"
            >
              Review Fix
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
