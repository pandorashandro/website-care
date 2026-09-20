import { cn } from '@/lib/ui/cn'

export type ScoreMeterSize = 'sm' | 'lg'

export type ScoreMeterProps = {
  /** Null renders an honest "not yet available" empty track — never a fabricated 0. */
  score: number | null
  size?: ScoreMeterSize
  className?: string
  /** Accessible label describing what this score represents, e.g. "Overall Website Health: 86 out of 100". */
  'aria-label': string
}

/**
 * Sprint 3, Prompt 1's approved Overall Website Health direction: a
 * horizontal brand-gradient meter instead of a donut/ring. Rationale
 * (from the architecture doc): a ring implies "percent of a whole," which
 * invites exactly the false-complete-coverage impression the product must
 * never give on a partial crawl; a linear meter has no "empty wedge" to
 * misread as missing data. The marker's fill uses the shared
 * `--brand-gradient` token (globals.css) mapped low-to-high across the
 * SAME four brand stops everywhere this meter appears — never a
 * per-instance color choice.
 *
 * Purely presentational: takes an already-computed score, computes
 * nothing itself. Used for both Overall Website Health (size="lg") and
 * each pillar tile (size="sm").
 */
export default function ScoreMeter({ score, size = 'lg', className, ...props }: ScoreMeterProps) {
  const height = size === 'lg' ? 'h-2.5' : 'h-1.5'
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score))

  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-surface-muted', height, className)} role="img" aria-label={props['aria-label']}>
      {score !== null && (
        <div
          className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
          style={{ width: `${pct}%`, background: 'var(--brand-gradient)' }}
        />
      )}
    </div>
  )
}
