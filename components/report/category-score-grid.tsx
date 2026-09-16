import Link from 'next/link'
import { Wrench } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import type { CategoryScores } from '@/lib/scanner/calculate-health-score'
import { healthLabel } from '@/lib/scanner/health-label'
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_ICONS } from './report-helpers'
import type { CategorySummary } from '@/lib/category-engine/types'

function barColor(score: number): string {
  if (score >= 90) return 'bg-green-500'
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

/**
 * Phase 26B correction — 'technical' is excluded from CATEGORY_ORDER's own
 * legacy rendering below; the Technical SEO tile in THIS SAME grid is
 * rendered from `technicalSeo` (a CategorySummary — see
 * lib/category-engine/types.ts) instead. This is the fix for the exact
 * duplicate-scoring bug a prior attempt introduced: Technical SEO must live
 * INSIDE this existing "Category Health" grid (not a standalone card above
 * the report), and its score/status/finding-count must come from the ONE
 * authoritative persisted analysis (app/dashboard/websites/[id]/
 * technical-seo-summary.ts's getTechnicalSeoCategorySummary) — the exact
 * same source the dedicated Technical SEO page reads — never recomputed
 * here, and never read from `categories.technical`. The remaining four
 * categories (seo/accessibility/performance/content) are unchanged legacy
 * placeholders until their own canonical engines are built.
 */
const OTHER_CATEGORY_ORDER = CATEGORY_ORDER.filter((category) => category !== 'technical')

function TechnicalSeoTile({ websiteId, summary }: { websiteId: string; summary: CategorySummary }) {
  if (summary.status === 'not_analyzed') {
    return (
      <Link href={`/dashboard/websites/${websiteId}/technical-seo`}>
        <Card padding="sm" className="h-full border-dashed hover:border-border-strong">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted">
              <Wrench className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-gray-900">Technical SEO</span>
          </div>
          <p className="mt-3 text-sm text-muted">Not analyzed yet</p>
        </Card>
      </Link>
    )
  }

  // score/findingsCount are non-null whenever status === 'analyzed' (see
  // buildTechnicalSeoCategorySummary) — asserted here rather than widening
  // CategorySummary's own types with a redundant discriminant duplication.
  const score = summary.score as number
  const findingsCount = summary.findingsCount as number

  return (
    <Link href={`/dashboard/websites/${websiteId}/technical-seo`}>
      <Card padding="sm" className="h-full hover:border-border-strong">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
              <Wrench className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-gray-900">Technical SEO</span>
          </div>
          {summary.partial && <Badge tone="neutral">Partial</Badge>}
        </div>

        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xl font-semibold text-gray-900">{score}</span>
          <span className="text-xs text-muted">{healthLabel(score)}</span>
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className={`h-full rounded-full ${barColor(score)}`} style={{ width: `${score}%` }} />
        </div>

        <p className="mt-2 text-xs text-muted">
          {findingsCount} finding{findingsCount === 1 ? '' : 's'}
        </p>
      </Card>
    </Link>
  )
}

export default function CategoryScoreGrid({
  categories,
  websiteId,
  technicalSeo,
}: {
  categories: CategoryScores
  websiteId: string
  technicalSeo: CategorySummary
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">Category Health</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TechnicalSeoTile websiteId={websiteId} summary={technicalSeo} />

        {OTHER_CATEGORY_ORDER.map((category) => {
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
