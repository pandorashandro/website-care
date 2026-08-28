import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

export type EmptyStateProps = {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Shared empty-state shell — dashed border card with an optional icon, title, description, and action, for "no websites yet" / "no fixes yet" style states across the platform. */
export default function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface px-6 py-16 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-muted">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h2 className="text-sm font-medium text-gray-900">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
