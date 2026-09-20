import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { healthLabel, healthTone } from '@/lib/scanner/health-label'
import type { OverallWebsiteHealth } from '@/lib/category-engine/overall-health'

/**
 * Unified webioom engine — the ONE canonical "Overall Website Health" card,
 * replacing the legacy homepage-scan-derived score that used to carry this
 * exact label (see components/report/health-overview.tsx, now repurposed
 * for the narrower legacy homepage report further down the page). This
 * card's number comes ONLY from `computeOverallWebsiteHealth`
 * (lib/category-engine/overall-health.ts) — the unweighted mean of
 * whichever canonical categories (Technical SEO, On-Page SEO, Site
 * Architecture, Content) have a genuine analysis from the current crawl.
 *
 * Never shows a number it cannot honestly justify: `score === null` means
 * zero canonical categories have been analyzed yet, and the card says so
 * plainly rather than defaulting to 0 or 100. Whenever a score IS shown,
 * the contributing-category count is always visible alongside it — a
 * customer can always tell whether this reflects "all 4" or "just 1."
 */
export default function OverallWebsiteHealthCard({ health }: { health: OverallWebsiteHealth }) {
  return (
    <Card padding="md">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Overall Website Health</p>

      {health.score === null ? (
        <>
          <p className="mt-2 text-2xl font-semibold text-gray-900">Not yet available</p>
          <p className="mt-2 text-sm text-muted">Run a scan to see your overall website health.</p>
        </>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-semibold tracking-tight text-gray-900">{health.score}</span>
            <span className="text-base text-muted">/ 100</span>
            <Badge tone={healthTone(health.score)} className="text-sm">
              {healthLabel(health.score)}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-muted">
            Based on {health.contributingCategoryCount} of {health.totalCanonicalCategories} canonical categories analyzed so far.
          </p>
        </>
      )}
    </Card>
  )
}
