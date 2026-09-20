import { cn } from '@/lib/ui/cn'

export type ToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
  id?: string
}

/**
 * Sprint 3, Prompt 2 — a real switch control (role="switch"), replacing the
 * bare `<input type="checkbox">` previously used for monitoring on/off
 * (monitoring-settings-form.tsx). Built on a native <button> so keyboard
 * activation (Space/Enter) and focus styling come for free — no ARIA
 * pattern to hand-roll beyond the role/aria-checked pair itself.
 */
export default function Toggle({ checked, onChange, disabled, label, className, id }: ToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        checked ? 'bg-brand' : 'bg-border-strong',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform duration-150 ease-out',
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  )
}
