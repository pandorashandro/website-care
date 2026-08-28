import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/ui/cn'

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_STYLES: Record<ContainerSize, string> = {
  sm: 'max-w-2xl',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
}

export type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  size?: ContainerSize
}

/** The one shared page-width convention — replaces ad hoc `mx-auto max-w-3xl px-6` / `mx-auto max-w-5xl px-6` repeated per-page. */
export default function Container({ size = 'lg', className, ...props }: ContainerProps) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6', SIZE_STYLES[size], className)} {...props} />
}
