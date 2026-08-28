import { cn } from '@/lib/ui/cn'

export type LogoProps = {
  /** Hides the "Website Care" wordmark, showing only the mark — for tight spaces (e.g. a collapsed mobile bar). */
  markOnly?: boolean
  className?: string
}

/**
 * Temporary brand mark: a simple rounded monogram + wordmark, deliberately
 * plain rather than a finished logo — the product name/branding is not
 * finalized (see Phase 18.2 brief). Kept as one small component so the real
 * logo can replace this later without touching every place the brand
 * appears.
 */
export default function Logo({ markOnly = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground">
        W
      </span>
      {!markOnly && <span className="text-base font-semibold tracking-tight text-gray-900">Website Care</span>}
    </span>
  )
}
