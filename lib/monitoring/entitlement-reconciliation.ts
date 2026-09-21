import { evaluateMonitoringEnable } from '@/lib/entitlements/capabilities'
import type { MonitoringCadence } from '@/lib/entitlements/plans'
import type { PlanEntitlements } from '@/lib/entitlements/subscription'

/**
 * Sprint 2, Prompt 2 — STEP 4 / STEP 13. Pure, deterministic reconciliation
 * between a website's STORED monitoring cadence preference
 * (website_monitoring_settings.cadence — "what this owner asked for," set
 * by app/dashboard/websites/[id]/monitoring-settings.ts at the time they
 * asked for it) and their CURRENT plan entitlement (which may have changed
 * since — a downgrade, a lapsed subscription), re-resolved fresh on every
 * scheduled run so a plan change is never allowed to grant a cadence the
 * customer's account no longer merits.
 *
 * This is deliberately run at EXECUTION time, not just at settings-write
 * time — Prompt 1's own evaluateMonitoringCadenceChoice already prevents a
 * customer from ever STORING a cadence their plan doesn't grant, but a
 * plan can lapse or downgrade at any point AFTER that write, entirely
 * outside of any monitoring-settings action. Without this re-check, a
 * downgraded customer's stored 'daily' preference would otherwise keep
 * scheduling daily scans forever — exactly the "a downgrade must not
 * silently allow an unavailable cadence forever" failure this sprint's own
 * Step 4 calls out.
 *
 * 'downgrade' is disclosed, not silent: the corrected cadence is written
 * back to the stored settings row itself (see lib/monitoring/monitoring-
 * run.ts), so the customer sees their own corrected preference the very
 * next time they open Monitoring Settings — never a value that quietly
 * diverges from what is actually scheduled.
 */
export type CadenceReconciliation =
  /** The plan no longer permits scheduled monitoring at all — monitoring must be fully disabled, not merely slowed down. */
  | { action: 'disable' }
  /** The stored cadence exceeded what the current plan grants — clamped down to the plan's own ceiling. */
  | { action: 'downgrade'; cadence: 'biweekly' | 'weekly' | 'daily' }
  /** The stored cadence is still within (or equal to) what the current plan grants — nothing to change. */
  | { action: 'keep'; cadence: 'biweekly' | 'weekly' | 'daily' }

const CADENCE_RANK: Record<MonitoringCadence, number> = { none: 0, biweekly: 1, weekly: 2, daily: 3 }

export function reconcileCadenceWithEntitlements(storedCadence: MonitoringCadence, entitlements: PlanEntitlements): CadenceReconciliation {
  // Defensive only: the settings write path never persists this
  // combination (see the migration's own comment on website_monitoring_
  // settings.cadence), so a stored 'none' cadence on an enabled row
  // reaching here at all would already be a data inconsistency — treated
  // the same as "plan does not permit monitoring," never as a crash.
  if (storedCadence === 'none') return { action: 'disable' }

  const enableCheck = evaluateMonitoringEnable(entitlements)
  if (!enableCheck.allowed) return { action: 'disable' }

  const grantedCadence = entitlements.monitoringCadence
  if (grantedCadence === 'none') return { action: 'disable' }

  if (CADENCE_RANK[storedCadence] > CADENCE_RANK[grantedCadence]) {
    return { action: 'downgrade', cadence: grantedCadence }
  }
  return { action: 'keep', cadence: storedCadence }
}
