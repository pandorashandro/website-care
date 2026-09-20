import { ChevronDown } from 'lucide-react'
import Card from './card'
import { cn } from '@/lib/ui/cn'

export type FaqItem = { question: string; answer: string }

/**
 * A plain native `<details>`/`<summary>` accordion — no headless-UI/
 * disclosure dependency exists anywhere in this codebase (see
 * docs/paddle-billing.md's precedent for avoiding a dependency for
 * something the platform already does natively), and `<details>` gives
 * keyboard support, the correct implicit ARIA semantics, and toggle
 * behavior for free, with zero client-side JavaScript.
 */
export default function FaqAccordion({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => (
        <Card key={item.question} padding="none" className="overflow-hidden">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-gray-900 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset">
              {item.question}
              <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="px-5 pb-4 text-sm text-muted">{item.answer}</p>
          </details>
        </Card>
      ))}
    </div>
  )
}
