import type { ReactNode, SVGProps } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

export type FlowStep = {
  label: string
  icon?: (props: SVGProps<SVGSVGElement>) => ReactNode
}

export type FlowDiagramProps = {
  steps: FlowStep[]
  className?: string
}

/**
 * Small reusable "A → B → C" workflow diagram built from plain HTML/CSS —
 * chips connected by arrows, wrapping naturally on narrow screens. Used
 * anywhere a page needs to visually explain a sequence (scan vs. integration
 * flow, the WordPress fix workflow, the trust workflow) without a bespoke
 * diagram per page.
 */
export default function FlowDiagram({ steps, className }: FlowDiagramProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-3', className)}>
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-gray-700">
            {step.icon && <step.icon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />}
            {step.label}
          </span>
          {index < steps.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />}
        </div>
      ))}
    </div>
  )
}
