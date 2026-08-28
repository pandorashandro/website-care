import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/ui/cn'

/**
 * A plain pulsing block — never shaped or labeled to resemble real content
 * (no fake website names, scores, or text), just a neutral placeholder for
 * "this area is loading."
 */
export default function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-surface-muted', className)} {...props} />
}
