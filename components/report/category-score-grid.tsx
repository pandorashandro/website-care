import Link from 'next/link'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import HealthGauge from '@/components/ui/health-gauge'
import { PILLAR_IDENTITY, type PillarKey } from '@/components/website/pillar-identity'
import type { CategorySummary } from '@/lib/category-engine/types'

const PILLAR_LABELS: Record<PillarKey, string> = {
  'technical-seo': 'Technical SEO',
  'on-page-seo': 'On-Page SEO',
  content: 'Content',
  'site-architecture': 'Site Architecture',
  performance: 'Performance',
  accessibility: 'Accessibility',
  security: 'Security',
}

/**
 * Sprint 3, Prompt 2B (structural reset) — the seven-pillar grid, rebuilt
 * around two things a flat "icon + number + thin bar" card never had: a
 * `HealthGauge` (the same radial visual used for Overall Website Health, at
 * a smaller size, so a pillar tile visibly belongs to the same system as
 * the flagship metric) and a genuine per-pillar identity color from
 * `PILLAR_IDENTITY`, expressed as a colored top edge — the same "colored
 * accent bar" convention already used for Billing's plan card and Overall
 * Website Health, now extended here so the whole product reads as one
 * visual system rather than seven identical gray cards with different
 * labels.
 */
function CategoryEngineTile({ pillarKey, href, summary }: { pillarKey: PillarKey; href: string; summary: CategorySummary }) {
  const identity = PILLAR_IDENTITY[pillarKey]
  const Icon = identity.icon
  const label = PILLAR_LABELS[pillarKey]

  if (summary.status === 'not_analyzed') {
    return (
      <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
        <Card padding="none" className="h-full overflow-hidden border-dashed hover:border-border-strong">
          <div className="h-1 w-full bg-border" aria-hidden="true" />
          <div className="flex items-center gap-3 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-muted">Not analyzed yet</p>
            </div>
          </div>
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
    <Link
      href={href}
      className="block rounded-lg motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Card padding="none" className="h-full overflow-hidden transition-colors duration-150 ease-out hover:border-border-strong">
        <div className="h-1 w-full" style={{ backgroundColor: identity.accent }} aria-hidden="true" />
        <div className="flex items-center gap-3 p-3">
          <HealthGauge score={score} size="sm" aria-label={`${label}: ${score} out of 100`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: identity.accent }} aria-hidden="true" />
              <span className="truncate text-sm font-semibold text-gray-900">{label}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {findingsCount} finding{findingsCount === 1 ? '' : 's'}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {summary.partial && <Badge tone="neutral">Partial</Badge>}
              {/* Evidence-aware health scoring (2026-09-22): 'low' means the
                  score above is real but built from thin evidence (e.g. only
                  1 eligible page) — shown ALONGSIDE the number, never in
                  place of it. See lib/category-engine/types.ts's CoverageLevel. */}
              {summary.coverage === 'low' && <Badge tone="warning">Limited data</Badge>}
            </div>
          </div>
        </div>
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
      <h2 className="text-base font-semibold text-gray-900">Seven pillars</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        <CategoryEngineTile pillarKey="technical-seo" href={`/dashboard/websites/${websiteId}/technical-seo`} summary={technicalSeo} />
        <CategoryEngineTile pillarKey="on-page-seo" href={`/dashboard/websites/${websiteId}/on-page-seo`} summary={onPageSeo} />
        <CategoryEngineTile pillarKey="site-architecture" href={`/dashboard/websites/${websiteId}/site-architecture`} summary={siteArchitecture} />
        <CategoryEngineTile pillarKey="content" href={`/dashboard/websites/${websiteId}/content`} summary={content} />
        <CategoryEngineTile pillarKey="performance" href={`/dashboard/websites/${websiteId}/performance`} summary={performance} />
        <CategoryEngineTile pillarKey="accessibility" href={`/dashboard/websites/${websiteId}/accessibility`} summary={accessibility} />
        <CategoryEngineTile pillarKey="security" href={`/dashboard/websites/${websiteId}/security`} summary={security} />
      </div>
    </div>
  )
}
