import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/ui/cn'

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const SIZE_STYLES: Record<ContainerSize, string> = {
  sm: 'max-w-2xl',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  /** Sprint 3, Prompt 2 — the wide-desktop tier for information-dense report pages (Website Overview, pillar reports). Resolves the width-ceiling debt Prompt 1's audit found: even `xl` (1152px) left 300–500px of unused space on modern desktop widths. */
  '2xl': 'max-w-[1440px]',
}

export type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  size?: ContainerSize
}

/** The one shared page-width convention — replaces ad hoc `mx-auto max-w-3xl px-6` / `mx-auto max-w-5xl px-6` repeated per-page. */
export default function Container({ size = 'lg', className, ...props }: ContainerProps) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6', SIZE_STYLES[size], className)} {...props} />
}
