import Card from '@/components/ui/card'
import type { CategoryScores } from '@/lib/scanner/calculate-health-score'
import { healthLabel } from '@/lib/scanner/health-label'
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_ICONS } from './report-helpers'

function barColor(score: number): string {
  if (score >= 90) return 'bg-green-500'
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function CategoryScoreGrid({ categories }: { categories: CategoryScores }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">Category Health</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORY_ORDER.map((category) => {
          const score = categories[category]
          const Icon = CATEGORY_ICONS[category]
          return (
            <Card key={category} padding="sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-gray-900">{CATEGORY_LABELS[category]}</span>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xl font-semibold text-gray-900">{score}</span>
                <span className="text-xs text-muted">{healthLabel(score)}</span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className={`h-full rounded-full ${barColor(score)}`} style={{ width: `${score}%` }} />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
