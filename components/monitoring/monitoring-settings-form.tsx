'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateMonitoringSettings, type MonitoringSettings } from '@/app/dashboard/websites/[id]/monitoring-settings'
import type { MonitoringCadence } from '@/lib/entitlements/plans'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'
import Badge from '@/components/ui/badge'
import { Label } from '@/components/ui/input'
import UpgradePrompt from '@/components/billing/upgrade-prompt'
import { formatDate } from '@/components/report/report-helpers'

const CADENCE_LABELS: Record<'weekly' | 'daily', string> = { weekly: 'Weekly', daily: 'Daily' }

/**
 * Sprint 2, Prompt 2 — STEP 11. The minimum customer-facing control needed
 * to actually use scheduled monitoring: on/off, an allowed cadence, and a
 * notification preference. `grantedCadence` is this customer's CURRENT
 * plan's own entitlement (lib/entitlements/plans.ts's monitoringCadence,
 * resolved server-side by the page that renders this form) — the cadence
 * options offered here are always a subset of what that plan actually
 * grants, never a fabricated capability, and turning monitoring on at all
 * is refused client-side (via UpgradePrompt, the same reusable component
 * the fix-execution paywall already uses) whenever `grantedCadence` is
 * 'none'. This is a UX convenience only: `updateMonitoringSettings` itself
 * independently re-checks the SAME entitlement server-side on every save
 * (see its own doc comment) and is the actual, authoritative enforcement
 * — this form cannot grant anything on its own.
 */
export default function MonitoringSettingsForm({
  websiteId,
  initialSettings,
  grantedCadence,
}: {
  websiteId: string
  initialSettings: MonitoringSettings
  grantedCadence: MonitoringCadence
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialSettings.monitoringEnabled)
  const [cadence, setCadence] = useState<MonitoringCadence>(initialSettings.cadence === 'none' ? (grantedCadence === 'none' ? 'weekly' : grantedCadence) : initialSettings.cadence)
  const [notificationPreference, setNotificationPreference] = useState<'none' | 'email'>(initialSettings.notificationPreference)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

  const availableCadences: ('weekly' | 'daily')[] = grantedCadence === 'daily' ? ['weekly', 'daily'] : grantedCadence === 'weekly' ? ['weekly'] : []
  const monitoringAvailableOnPlan = grantedCadence !== 'none'

  function handleToggle(next: boolean) {
    if (next && !monitoringAvailableOnPlan) {
      setShowUpgrade(true)
      return
    }
    setEnabled(next)
  }

  async function handleSave() {
    setPending(true)
    setError(null)

    try {
      const result = await updateMonitoringSettings(websiteId, {
        enabled,
        cadence: enabled ? cadence : 'none',
        notificationPreference,
      })

      if (!result.ok) {
        if (result.reason === 'feature_not_in_plan' || result.reason === 'subscription_inactive') {
          setShowUpgrade(true)
        } else {
          setError(result.error)
        }
        return
      }

      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Scheduled Monitoring</p>
          <p className="mt-1 text-sm text-muted">
            {monitoringAvailableOnPlan
              ? 'Automatically re-scan this website on a schedule and see what changed.'
              : 'Automatic recurring scans are included on Bloom and above.'}
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>

      {!monitoringAvailableOnPlan && (
        <Badge tone="neutral" className="mt-3">
          Monitoring requires Bloom
        </Badge>
      )}

      {enabled && monitoringAvailableOnPlan && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="monitoring-cadence">How often</Label>
            <select
              id="monitoring-cadence"
              value={cadence === 'none' ? availableCadences[0] : cadence}
              onChange={(e) => setCadence(e.target.value as MonitoringCadence)}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {availableCadences.map((option) => (
                <option key={option} value={option}>
                  {CADENCE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="monitoring-notifications">Notifications</Label>
            <select
              id="monitoring-notifications"
              value={notificationPreference}
              onChange={(e) => setNotificationPreference(e.target.value as 'none' | 'email')}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="none">None (check in-app only)</option>
              <option value="email">Email me</option>
            </select>
          </div>
        </div>
      )}

      {initialSettings.lastRunStatus === 'failed' && (
        <Alert tone="danger" className="mt-4">
          Last monitoring scan failed{initialSettings.lastRunAt ? ` (${formatDate(initialSettings.lastRunAt)})` : ''}.
          {initialSettings.lastRunError ? ` ${initialSettings.lastRunError}` : ''} webioom will automatically try again on
          its normal schedule.
        </Alert>
      )}

      <div className="mt-4">
        <Button type="button" variant="primary" size="sm" disabled={pending} onClick={handleSave}>
          {pending ? 'Saving…' : 'Save Monitoring Settings'}
        </Button>
      </div>

      {error && (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      )}

      <UpgradePrompt
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        title="Turn on scheduled monitoring?"
        attemptedAction="Enable recurring monitoring for this website"
        benefit="Bloom re-scans this website automatically and tells you what changed — no need to remember to check back."
      />
    </div>
  )
}
