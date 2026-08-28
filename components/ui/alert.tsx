import type { HTMLAttributes } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

export type AlertTone = 'danger' | 'success' | 'info'

const TONE_STYLES: Record<AlertTone, string> = {
  danger: 'border-red-200 bg-danger-subtle text-red-700',
  success: 'border-green-200 bg-success-subtle text-green-700',
  info: 'border-blue-200 bg-info-subtle text-blue-700',
}

const TONE_ICONS: Record<AlertTone, typeof AlertTriangle> = {
  danger: AlertTriangle,
  success: CheckCircle2,
  info: Info,
}

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone
}

/** Shared inline feedback message (form errors, success confirmations) — replaces ad hoc `<p className="text-red-600">` blocks with a consistent, icon-labeled pattern. */
export default function Alert({ tone = 'info', className, children, ...props }: AlertProps) {
  const Icon = TONE_ICONS[tone]

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', TONE_STYLES[tone], className)}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
