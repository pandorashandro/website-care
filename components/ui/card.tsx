import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/ui/cn'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** 'md' matches the padding already used throughout the dashboard (p-5/p-6); 'sm' is for denser, nested cards. */
  padding?: 'sm' | 'md' | 'none'
}

const PADDING_STYLES: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
}

/** The one shared card surface — rounded-lg border + shadow-sm + white surface, reused across the public site and the platform instead of every screen re-declaring it. */
export default function Card({ padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface shadow-sm', PADDING_STYLES[padding], className)}
      {...props}
    />
  )
}
