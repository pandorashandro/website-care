import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/ui/cn'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-gray-600',
  brand: 'bg-brand-subtle text-brand',
  success: 'bg-success-subtle text-green-700',
  warning: 'bg-warning-subtle text-amber-700',
  danger: 'bg-danger-subtle text-red-700',
  info: 'bg-info-subtle text-blue-700',
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
}

/** The one shared pill/badge shape — used for severity, status, verification, and connection indicators alike. */
export default function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_STYLES[tone],
        className
      )}
      {...props}
    />
  )
}
