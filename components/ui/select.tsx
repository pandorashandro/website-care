import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

/**
 * Sprint 3, Prompt 2 — a native <select> styled to match Input's own
 * surface/border/focus treatment, replacing the ad hoc inline-Tailwind
 * selects previously repeated per call site (e.g. monitoring-settings-form.tsx).
 * Deliberately still a native element, not a custom listbox — keyboard/
 * screen-reader behavior comes for free, and no dropdown-positioning code
 * is needed for this simple case.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'block w-full appearance-none rounded-md border border-border bg-surface px-3 py-2 pr-9 text-sm text-gray-900',
          'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
    </div>
  )
})

export default Select
