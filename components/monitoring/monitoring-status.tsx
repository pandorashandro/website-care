import { formatDate } from '@/components/report/report-helpers'
import type { MonitoringSettings } from '@/app/dashboard/websites/[id]/monitoring-settings'
import type { MonitoringCadence } from '@/lib/entitlements/plans'

/**
 * Sprint 2, Prompt 2 — STEP 12. The ONLY monitoring-related addition to
 * Overview: a single-line, honest status — never a second analytics
 * surface (the "Since Last Scan" card, unchanged from Prompt 1, remains
 * the primary change-intelligence experience). Every fact shown here comes
 * straight from website_monitoring_settings; nothing is computed or
 * inferred here.
 *
 * Sprint 3, Prompt 2B (final continuation) — restyled from a plain Badge
 * into a live-status dot + line, directly answering "is webioom watching
 * my website?" at a glance. The dot is static (no pulse animation) per
 * this pass's own "no constant pulse" motion rule — color alone, not
 * motion, carries the status.
 */
export default function MonitoringStatus({ settings, grantedCadence }: { settings: MonitoringSettings; grantedCadence: MonitoringCadence }) {
  if (!settings.monitoringEnabled) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
        {grantedCadence === 'none' ? 'Monitoring requires Bloom' : 'Monitoring is off'}
      </p>
    )
  }

  if (settings.lastRunStatus === 'failed') {
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
        <span className="text-muted">
          Last scan failed{settings.lastRunAt ? ` (${formatDate(settings.lastRunAt)})` : ''} — webioom will retry automatically.
        </span>
      </p>
    )
  }

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
      <span className="font-medium text-gray-700">Monitoring active</span>
      <span className="text-muted">
        · {settings.lastRunAt ? `Last checked ${formatDate(settings.lastRunAt)}` : 'Not checked yet'}
        {settings.nextDueAt ? ` · Next check ${formatDate(settings.nextDueAt)}` : ''}
      </span>
    </p>
  )
}
