import Badge from '@/components/ui/badge'
import HealthGauge from '@/components/ui/health-gauge'

const EXAMPLE_FINDINGS = [
  { title: 'Missing meta description', meta: '12 pages affected', edge: 'var(--color-danger)' },
  { title: 'Slow initial page response', meta: '4 pages affected', edge: 'var(--color-warning)' },
  { title: 'Missing image alt text', meta: '3 pages affected', edge: 'var(--color-border-strong)' },
]

/**
 * Sprint 3, Prompt 2B (public-site rebuild) — a genuine product
 * demonstration instead of another paragraph describing the product.
 * Built entirely from real, already-shipped UI pieces (`HealthGauge`, the
 * same severity-edge finding language used on every pillar report) so the
 * marketing site visually shows the actual product design system rather
 * than an invented mockup — while staying honest that it is illustrative,
 * never a live scan, matching the "Example only" convention already used
 * on the Website Health page.
 */
export default function ProductPreview({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-border bg-surface" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="h-1.5 w-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Example report</p>
            <Badge tone="neutral">Illustrative, not a live scan</Badge>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <HealthGauge score={78} size="md" aria-label="Example website health: 78 out of 100" />
            <div>
              <p className="text-sm font-semibold text-gray-900">example-store.com</p>
              <Badge tone="warning" className="mt-1">
                Needs Attention
              </Badge>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {EXAMPLE_FINDINGS.map((finding) => (
              <div key={finding.title} className="relative overflow-hidden rounded-lg border border-border">
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: finding.edge }} aria-hidden="true" />
                <div className="p-3 pl-4">
                  <p className="text-sm font-medium text-gray-900">{finding.title}</p>
                  <p className="text-xs text-muted">{finding.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
