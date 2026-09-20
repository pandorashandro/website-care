import Badge from '@/components/ui/badge'
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
 */
export default function MonitoringStatus({ settings, grantedCadence }: { settings: MonitoringSettings; grantedCadence: MonitoringCadence }) {
  if (!settings.monitoringEnabled) {
    return <p className="mt-1 text-xs text-muted">{grantedCadence === 'none' ? 'Monitoring requires Bloom' : 'Monitoring is off'}</p>
  }

  if (settings.lastRunStatus === 'failed') {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone="danger">Monitoring</Badge>
        <span className="text-muted">
          Last scan failed{settings.lastRunAt ? ` (${formatDate(settings.lastRunAt)})` : ''} — webioom will retry automatically.
        </span>
      </p>
    )
  }

  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <Badge tone="success">Monitoring active</Badge>
      <span className="text-muted">
        {settings.lastRunAt ? `Last checked ${formatDate(settings.lastRunAt)}` : 'Not checked yet'}
        {settings.nextDueAt ? ` · Next check ${formatDate(settings.nextDueAt)}` : ''}
      </span>
    </p>
  )
}
