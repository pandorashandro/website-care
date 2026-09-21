import { cn } from '@/lib/ui/cn'

export type HealthGaugeSize = 'sm' | 'md' | 'lg'

const SIZE_PX: Record<HealthGaugeSize, number> = { sm: 56, md: 88, lg: 168 }
const STROKE_RATIO = 0.11
const SCORE_TEXT: Record<HealthGaugeSize, string> = { sm: 'text-sm', md: 'text-xl', lg: 'text-5xl' }

export type HealthGaugeProps = {
  /** Null renders an honest empty ring — never a fabricated 0. */
  score: number | null
  size?: HealthGaugeSize
  className?: string
  'aria-label': string
}

/**
 * Sprint 3, Prompt 2B (structural reset) — replaces the flat horizontal
 * ScoreMeter as webioom's signature health visual. The founder's own
 * feedback after the previous, styling-only pass was explicit: a screenshot
 * test in grayscale, with the logo hidden, must still read as a genuinely
 * different product — a thin bar inside a white card cannot pass that test
 * no matter what color it uses, because its silhouette is indistinguishable
 * from countless other dashboards. A radial ring has a completely different
 * shape, negative-space use, and focal weight, and is memorable in exactly
 * the way flat bars are not.
 *
 * Still honest about partial data (Prompt 1's original constraint on
 * ScoreMeter): `score: null` renders a dim, empty ring, never a fabricated
 * value — this is not a donut chart implying "percent of total site
 * coverage," it is a 0–100 health scale, so there is no wedge to misread as
 * missing pages.
 *
 * The gradient sweep uses the exact same `--brand-gradient` stops
 * (violet → azure → teal → green) as every other health surface in the
 * product (ScoreMeter, score meters, active-scan progress) — one visual
 * vocabulary for "this is webioom's own health scale," not a per-component
 * invention. Reused at three sizes: `lg` for the Website Overview flagship
 * metric, `md` for Dashboard portfolio cards, `sm` for the seven-pillar
 * grid tiles — so the exact same shape now appears at every level of the
 * product, which is what makes it a recognizable system rather than a
 * one-off widget.
 */
export default function HealthGauge({ score, size = 'md', className, ...props }: HealthGaugeProps) {
  const px = SIZE_PX[size]
  const strokeWidth = Math.max(4, px * STROKE_RATIO)
  const radius = (px - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const dash = circumference * pct
  const gradientId = `health-gauge-gradient-${size}`

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: px, height: px }}
      role="img"
      aria-label={props['aria-label']}
    >
      <svg width={px} height={px} className="-rotate-90" aria-hidden="true">
        <circle cx={px / 2} cy={px / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
        {score !== null && (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700 motion-safe:ease-out"
          />
        )}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-violet)" />
            <stop offset="38%" stopColor="var(--color-sky)" />
            <stop offset="68%" stopColor="var(--color-teal)" />
            <stop offset="100%" stopColor="var(--color-brand-vivid)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {score === null ? (
          <span className={cn('font-semibold text-subtle', SCORE_TEXT[size])}>—</span>
        ) : (
          <span className={cn('font-bold tabular-nums text-gray-900', SCORE_TEXT[size])}>{score}</span>
        )}
      </div>
    </div>
  )
}
