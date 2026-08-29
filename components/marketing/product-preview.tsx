import Badge from '@/components/ui/badge'

/**
 * Purely illustrative marketing content — fixed numbers, never fetched from
 * Supabase or any live scan. Exists only to visually demonstrate the shape
 * of a real webioom report (health score, categories, priority, affected
 * page, action state) using the actual design system, not a screenshot.
 * The "Example report" label keeps it honest in the UI itself. Sits inside
 * the homepage hero as a compact card floating on the dark brand surface —
 * not a standalone full-width section.
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
    <div className="mx-auto w-full max-w-sm rounded-xl border border-white/10 bg-surface p-5 shadow-2xl shadow-black/30 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Website Health</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {DEMO_OVERALL_SCORE}
            <span className="text-base font-normal text-muted"> / 100</span>
          </p>
        </div>
        <Badge tone="success">Good</Badge>
      </div>

      <div className="mt-5 space-y-2">
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

      <div className="mt-5 rounded-lg border border-border bg-surface-muted p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="warning">High priority</Badge>
          <Badge tone="brand">Fix available</Badge>
        </div>
        <p className="mt-2 text-sm font-medium text-gray-900">Missing meta description</p>
        <p className="font-mono text-xs text-muted">/services</p>
      </div>

      <p className="mt-4 text-center text-[11px] text-subtle">Example report — not a live scan</p>
    </div>
  )
}
