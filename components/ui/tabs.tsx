import { cn } from '@/lib/ui/cn'

export type TabItem<T extends string> = { value: T; label: string }

export type TabsProps<T extends string> = {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  'aria-label': string
}

/**
 * Sprint 3, Prompt 2 — a small segmented-control-style tab switch (used for
 * Simple/Expert and any future two-to-four-way view switch). Not a routed
 * tab set — those stay as plain <Link> groups (WebsiteSubNav, the pillar
 * analysis rail) since their state belongs in the URL. This is for
 * same-page view state only.
 */
export default function Tabs<T extends string>({ items, value, onChange, className, ...props }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={props['aria-label']} className={cn('inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-muted p-1', className)}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out',
              active ? 'bg-surface text-gray-900 shadow-sm' : 'text-muted hover:text-gray-900'
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
