import Link from 'next/link'
import { Wrench, Network, Search, FileText, Gauge, Accessibility as AccessibilityIcon, Shield } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { healthLabel } from '@/lib/scanner/health-label'
import type { CategorySummary } from '@/lib/category-engine/types'

function barColor(score: number): string {
  if (score >= 90) return 'bg-green-500'
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

/**
 * Unified webioom engine, Prompt 2 — ALL SEVEN canonical categories
 * (Technical SEO, On-Page SEO, Site Architecture, Content, Performance,
 * Accessibility, Security) now render from a real, persisted
 * `CategorySummary` via this ONE shared tile component. The legacy
 * single-homepage-page scanner's own Accessibility/Performance categories
 * (calculate-health-score.ts's `categories` map) and the old placeholder
 * "Not yet available" Security tile are RETIRED from this grid — every
 * category shown here now comes from a genuine site-wide crawl-based
 * canonical engine, never a second, competing score.
 */
function CategoryEngineTile({
  href,
  label,
  icon: Icon,
  summary,
}: {
  href: string
  label: string
  icon: typeof Wrench
  summary: CategorySummary
}) {
  if (summary.status === 'not_analyzed') {
    return (
      <Link href={href}>
        <Card padding="sm" className="h-full border-dashed hover:border-border-strong">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-gray-900">{label}</span>
          </div>
          <p className="mt-3 text-sm text-muted">Not analyzed yet</p>
        </Card>
      </Link>
    )
  }

  // score/findingsCount are non-null whenever status === 'analyzed' (see
  // e.g. buildTechnicalSeoCategorySummary/buildPillarCategorySummary) —
  // asserted here rather than widening CategorySummary's own types with a
  // redundant discriminant duplication.
  const score = summary.score as number
  const findingsCount = summary.findingsCount as number

  return (
    <Link href={href}>
      <Card padding="sm" className="h-full hover:border-border-strong">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-gray-900">{label}</span>
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
  websiteId,
  technicalSeo,
  siteArchitecture,
  onPageSeo,
  content,
  performance,
  accessibility,
  security,
}: {
  websiteId: string
  technicalSeo: CategorySummary
  siteArchitecture: CategorySummary
  onPageSeo: CategorySummary
  content: CategorySummary
  performance: CategorySummary
  accessibility: CategorySummary
  security: CategorySummary
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">Category Health</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <CategoryEngineTile href={`/dashboard/websites/${websiteId}/technical-seo`} label="Technical SEO" icon={Wrench} summary={technicalSeo} />
        <CategoryEngineTile href={`/dashboard/websites/${websiteId}/on-page-seo`} label="On-Page SEO" icon={Search} summary={onPageSeo} />
        <CategoryEngineTile
          href={`/dashboard/websites/${websiteId}/site-architecture`}
          label="Site Architecture"
          icon={Network}
          summary={siteArchitecture}
        />
        <CategoryEngineTile href={`/dashboard/websites/${websiteId}/content`} label="Content" icon={FileText} summary={content} />
        <CategoryEngineTile href={`/dashboard/websites/${websiteId}/performance`} label="Performance" icon={Gauge} summary={performance} />
        <CategoryEngineTile href={`/dashboard/websites/${websiteId}/accessibility`} label="Accessibility" icon={AccessibilityIcon} summary={accessibility} />
        <CategoryEngineTile href={`/dashboard/websites/${websiteId}/security`} label="Security" icon={Shield} summary={security} />
      </div>
    </div>
  )
}
