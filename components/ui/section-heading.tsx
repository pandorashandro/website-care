import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

export type SectionHeadingProps = {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  className?: string
}

/** Consistent heading pattern (small brand-colored eyebrow + title + supporting copy) for both marketing sections and in-app section headers. */
export default function SectionHeading({ eyebrow, title, description, align = 'left', className }: SectionHeadingProps) {
  return (
    <div className={cn(align === 'center' && 'text-center', className)}>
      {eyebrow && <p className="text-sm font-semibold tracking-wide text-brand">{eyebrow}</p>}
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{title}</h2>
      {description && (
        <p className={cn('mt-2 max-w-2xl text-base text-muted', align === 'center' && 'mx-auto')}>{description}</p>
      )}
    </div>
  )
}
