import type { ReactNode } from 'react'
import Container, { type ContainerSize } from '@/components/ui/container'
import { cn } from '@/lib/ui/cn'

export type SectionTint = 'none' | 'muted' | 'dark'

export type SectionProps = {
  children: ReactNode
  tint?: SectionTint
  border?: 'top' | 'bottom' | 'none'
  size?: ContainerSize
  className?: string
  containerClassName?: string
}

/**
 * Sprint 3, Prompt 2B (final pass) — the one shared marketing-page section
 * wrapper. Every public page previously hand-repeated
 * `<div className="border-t border-border bg-surface-muted"><Container
 * size="lg" className="py-16 sm:py-20">` with slightly different padding
 * and border choices per file — this is the "product-wide consistency
 * sweep" (Section 39) applied to section rhythm specifically: one place
 * that decides section padding and alternating-tint treatment, so public
 * pages read as one deliberate system rather than separately built pages.
 * Padding is deliberately more generous than the old `py-16 sm:py-20`
 * (Wellows-benchmark "confident whitespace" — see the final-pass brief's
 * Section 2) without introducing any new visual language of its own.
 */
export default function Section({ children, tint = 'none', border = 'none', size = 'lg', className, containerClassName }: SectionProps) {
  return (
    <div
      className={cn(
        border === 'top' && 'border-t border-border',
        border === 'bottom' && 'border-b border-border',
        tint === 'muted' && 'bg-surface-muted',
        tint === 'dark' && 'bg-brand-dark',
        className
      )}
    >
      <Container size={size} className={cn('py-16 sm:py-24', containerClassName)}>
        {children}
      </Container>
    </div>
  )
}
