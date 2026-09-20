import type { MonitoringCadence } from '@/lib/entitlements/plans'

/**
 * Sprint 2, Prompt 2 — STEP 4. Deterministic cadence -> schedule math, pure
 * and UTC-safe by construction: every computation below is plain epoch-
 * millisecond arithmetic on `Date` objects, which carry no timezone of
 * their own — there is no "customer's local time" concept anywhere in
 * this module, exactly matching this sprint's own "use UTC internally"
 * instruction. `next_due_at` is stored as a `timestamptz` (see the
 * migration), so Postgres/JS both always treat it as an absolute instant,
 * never a wall-clock time in any particular zone.
 */

export const CADENCE_INTERVAL_MS: Record<'weekly' | 'daily', number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}

/**
 * `cadence: 'none'` has no schedule at all — returns null, never a
 * fabricated far-future date. Every other cadence returns `from` plus that
 * cadence's own fixed interval. `from` defaults to "now" for the common
 * case (enabling monitoring, or recomputing after a completed run) but is
 * a parameter so cadence CHANGES (Step 4's own "changing cadence must
 * correctly recompute next_due_at" requirement) can be tested
 * deterministically without depending on wall-clock time.
 */
export function computeNextDueAt(cadence: MonitoringCadence, from: Date = new Date()): string | null {
  if (cadence === 'none') return null
  return new Date(from.getTime() + CADENCE_INTERVAL_MS[cadence]).toISOString()
}
