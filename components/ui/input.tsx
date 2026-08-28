import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/ui/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-subtle',
        'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle',
        className
      )}
      {...props}
    />
  )
})

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-medium text-gray-700', className)} {...props} />
}
