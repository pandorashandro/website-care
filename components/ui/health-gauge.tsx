'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/ui/cn'

export type HealthGaugeSize = 'sm' | 'md' | 'lg'
export type HealthGaugeTheme = 'light' | 'dark'

const SIZE_PX: Record<HealthGaugeSize, number> = { sm: 56, md: 88, lg: 168 }
const STROKE_RATIO = 0.11
const SCORE_TEXT: Record<HealthGaugeSize, string> = { sm: 'text-sm', md: 'text-xl', lg: 'text-5xl' }
const ANIMATION_DURATION_MS = 1100

export type HealthGaugeProps = {
  /** Null renders an honest empty ring — never a fabricated 0. */
  score: number | null
  size?: HealthGaugeSize
  /** `dark` is for placing the gauge directly on a dark/gradient section (e.g. Website Health's flagship moment) — flips the score number and empty-track color so they stay visible against a dark background instead of inheriting near-black text. */
  theme?: HealthGaugeTheme
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
 * product. Reused at three sizes: `lg` for the flagship metric, `md` for
 * Dashboard portfolio cards, `sm` for the seven-pillar grid tiles — one
 * recognizable shape at every level of the product.
 *
 * Sprint 3, Prompt 2B (targeted correction) — two fixes:
 * 1. The score number was hardcoded to a dark, light-surface-only color,
 *    making it unreadable wherever this gauge sits on a dark section
 *    (Website Health's flagship moment). The new `theme` prop makes the
 *    number/empty-track color an explicit choice instead of an assumption.
 * 2. Added a presentational entrance animation: the ring sweeps and the
 *    number counts up together, once, the first time the gauge scrolls
 *    into view — implemented with a plain IntersectionObserver + rAF loop
 *    (no animation library), and skipped entirely under
 *    `prefers-reduced-motion: reduce`, where the final score renders
 *    immediately. This is purely a `displayScore` state variable driving
 *    what's drawn — the real `score` prop (the canonical, server-computed
 *    value) is never recalculated or altered, only its reveal is animated.
 */
export default function HealthGauge({ score, size = 'md', theme = 'light', className, ...props }: HealthGaugeProps) {
  const px = SIZE_PX[size]
  const strokeWidth = Math.max(4, px * STROKE_RATIO)
  const radius = (px - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const gradientId = `health-gauge-gradient-${size}`

  const rootRef = useRef<HTMLDivElement>(null)
  const [displayScore, setDisplayScore] = useState(0)

  useEffect(() => {
    if (score === null) return
    const node = rootRef.current
    if (!node) return

    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      // A deliberate one-time sync to an external signal (the OS-level
      // reduced-motion preference), read once on mount — not a value this
      // component could compute during render, and there is no animation
      // frame loop to defer it into for this branch specifically.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayScore(score)
      return
    }

    let animationFrame: number | null = null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()

        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / ANIMATION_DURATION_MS)
          const eased = 1 - Math.pow(1 - t, 3)
          setDisplayScore(Math.round(eased * score))
          if (t < 1) animationFrame = requestAnimationFrame(tick)
        }
        animationFrame = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    }
  }, [score])

  const pct = score === null ? 0 : Math.max(0, Math.min(100, displayScore)) / 100
  const dash = circumference * pct
  const trackColor = theme === 'dark' ? 'rgba(255,255,255,0.14)' : 'var(--color-border)'
  const scoreColor = theme === 'dark' ? 'text-text-on-dark' : 'text-gray-900'
  const emptyColor = theme === 'dark' ? 'text-text-on-dark-muted' : 'text-subtle'

  return (
    <div
      ref={rootRef}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: px, height: px }}
      role="img"
      aria-label={props['aria-label']}
    >
      <svg width={px} height={px} className="-rotate-90" aria-hidden="true">
        <circle cx={px / 2} cy={px / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
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
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        {score === null ? (
          <span className={cn('font-semibold', emptyColor, SCORE_TEXT[size])}>—</span>
        ) : (
          <span className={cn('font-bold tabular-nums', scoreColor, SCORE_TEXT[size])}>{displayScore}</span>
        )}
      </div>
    </div>
  )
}
