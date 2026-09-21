import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import ScoreMeter from '@/components/ui/score-meter'
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
 * Sprint 3, Prompt 2 — presentation redesign per the approved Prompt 1
 * blueprint: a horizontal brand-gradient meter (ScoreMeter) instead of a
 * donut/ring — a ring implies "percent of a whole," inviting exactly the
 * false-complete-coverage impression this card must never give on a
 * partial crawl. The coverage disclosure line is now the SAME visual
 * weight as the score's own state label, never a smaller caption — a
 * customer must never have to squint to learn "how much of my site was
 * actually checked." No change to the underlying computation.
 */
export default function OverallWebsiteHealthCard({ health }: { health: OverallWebsiteHealth }) {
  return (
    <Card padding="none" className="overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
      <div className="h-1.5 w-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />
      <div className="p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Overall Website Health</p>

        {health.score === null ? (
          <>
            <p className="mt-2 text-2xl font-semibold text-gray-900">Not yet available</p>
            <p className="mt-2 text-sm text-muted">Run a scan to see your overall website health.</p>
          </>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <span className="text-5xl font-semibold tracking-tight tabular-nums text-gray-900 motion-safe:animate-[webioom-rise-in_var(--duration-reveal)_var(--ease-out)_both]">
                {health.score}
              </span>
              <span className="pb-1 text-base text-muted">/ 100</span>
              <Badge tone={healthTone(health.score)} className="mb-1 text-sm">
                {healthLabel(health.score)}
              </Badge>
            </div>

            <ScoreMeter score={health.score} size="lg" className="mt-4 max-w-md" aria-label={`Overall Website Health: ${health.score} out of 100, ${healthLabel(health.score)}`} />

            <p className="mt-3 text-sm font-medium text-gray-700">
              Based on {health.contributingCategoryCount} of {health.totalCanonicalCategories} canonical categories analyzed so far.
            </p>
          </>
        )}
      </div>
    </Card>
  )
}
