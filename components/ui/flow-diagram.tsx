import type { ReactNode, SVGProps } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

export type FlowStep = {
  label: string
  icon?: (props: SVGProps<SVGSVGElement>) => ReactNode
  /** Renders this one chip with a highlighted brand accent — for the single step in a flow that most deserves emphasis (e.g. the human-approval step in a trust workflow), never more than one or two per diagram. */
  emphasize?: boolean
}

export type FlowDiagramProps = {
  steps: FlowStep[]
  className?: string
  /** `dark` renders translucent chips suited to a dark/gradient section (Section's `tint="dark"`) instead of the default light-surface chips. */
  variant?: 'light' | 'dark'
}

/**
 * Small reusable "A → B → C" workflow diagram built from plain HTML/CSS —
 * chips connected by arrows, wrapping naturally on narrow screens. Used
 * anywhere a page needs to visually explain a sequence (scan vs. integration
 * flow, the WordPress fix workflow, the trust workflow) without a bespoke
 * diagram per page.
 */
export default function FlowDiagram({ steps, className, variant = 'light' }: FlowDiagramProps) {
  const isDark = variant === 'dark'
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-3', className)}>
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium',
              isDark
                ? step.emphasize
                  ? 'border-white/20 bg-white/10 text-text-on-dark'
                  : 'border-white/10 bg-white/5 text-text-on-dark-muted'
                : step.emphasize
                  ? 'border-brand bg-brand-subtle text-brand'
                  : 'border-border bg-surface text-gray-700'
            )}
            style={isDark && step.emphasize ? { boxShadow: '0 0 0 1px var(--color-violet), 0 0 20px rgba(109,63,249,0.45)' } : undefined}
          >
            {step.icon && <step.icon className={cn('h-3.5 w-3.5', isDark ? 'text-brand-vivid' : 'text-brand')} aria-hidden="true" />}
            {step.label}
          </span>
          {index < steps.length - 1 && (
            <ArrowRight className={cn('h-4 w-4 shrink-0', isDark ? 'text-white/20' : 'text-subtle')} aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  )
}
