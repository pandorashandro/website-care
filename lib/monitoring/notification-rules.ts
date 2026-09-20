import { sortFindingChangesBySeverity, type ChangeSummary, type FindingChange, type ChangeState } from './compare'
import type { Severity } from './types'

/**
 * Sprint 2, Prompt 2 — STEP 6/7. Deterministic noise control: decides
 * whether a completed comparison (Sprint 2 Prompt 1's own ChangeSummary)
 * contains anything a customer should actually be told about, and if so,
 * why. Pure — no I/O, no AI, fully unit-testable — mirroring
 * lib/monitoring/compare.ts's own purity convention exactly.
 *
 * THIS IS A NOISE-CONTROL PRODUCT RULE, NOT AN SEO-SCORING RULE. The
 * numeric thresholds below decide "is this worth an email," never "is this
 * good or bad for the website" (that judgment already happened, upstream,
 * in the deterministic NEW/RESOLVED/WORSENED/IMPROVED/UNVERIFIED
 * classification and the persisted health/pillar scores themselves — this
 * module changes none of that). They are centralized here, in one place,
 * specifically so they can be tuned for notification volume without ever
 * touching scoring or classification logic.
 *
 * WHY REPEATED "NEW ISSUE" ALERTS FOR AN UNCHANGED CONDITION CANNOT HAPPEN:
 * a finding is only ever classified 'new' in the ONE comparison where it
 * first appears (previous snapshot lacks it, current snapshot has it). In
 * every subsequent monitoring cycle's own previous/current comparison,
 * that same finding (same deterministic fingerprint) is already present in
 * BOTH snapshots being compared, so it is classified 'persistent' instead
 * — which this module deliberately does NOT treat as meaningful on its
 * own (see MEANINGFUL_CHANGE_STATES below). No separate "have we already
 * alerted about this fingerprint" tracking table is needed: the
 * fingerprint-based comparison model in compare.ts already makes
 * "unchanged condition" and "newly-appeared condition" structurally
 * distinguishable, every single cycle, for free. If a finding is
 * RESOLVED and later reappears, it is compared against whichever snapshot
 * immediately preceded it — which no longer contains it — so it is
 * classified 'new' again and is fully eligible to be meaningful again.
 */

/** Overall Health movement of at least this many points (either direction) is meaningful. Deliberately larger than 1 point so ordinary day-to-day noise (e.g. a single low-severity finding changing) does not itself trigger an email. */
export const MEANINGFUL_HEALTH_DELTA_THRESHOLD = 5

/** Same reasoning as MEANINGFUL_HEALTH_DELTA_THRESHOLD, applied per pillar — pillars are more concentrated (fewer checks feed each one), so a smaller absolute movement there is already meaningful. */
export const MEANINGFUL_PILLAR_DELTA_THRESHOLD = 8

/** At least this many previously-tracked findings becoming UNVERIFIED (not falsely "fixed," but also no longer confirmable) in one cycle is itself worth surfacing — the customer's own confidence in "what's actually going on" has measurably degraded, independent of any specific finding's fate. */
export const MEANINGFUL_UNVERIFIED_COUNT_THRESHOLD = 3

/** Only these severities make a NEW or WORSENED finding meaningful on its own — a new/worsened medium or low finding is still recorded in the comparison and shown in-app (Since Last Scan, History), just never triggers a notification by itself. */
const MEANINGFUL_NEW_OR_WORSENED_SEVERITIES: ReadonlySet<Severity> = new Set(['critical', 'high'])

export type MeaningfulChangeReason =
  | 'new_high_severity_finding'
  | 'worsened_high_severity_finding'
  | 'resolved_finding'
  | 'improved_finding'
  | 'overall_health_declined'
  | 'overall_health_improved'
  | 'pillar_score_declined'
  | 'pillar_score_improved'
  | 'coverage_degraded'

export type MeaningfulChangeResult = {
  meaningful: boolean
  reasons: MeaningfulChangeReason[]
}

/** States eligible to appear in an event's own "top findings" list — persistent/unverified findings are shown in-app but never in the notification content itself, keeping the email focused on what actually changed. */
const NOTIFIABLE_STATES: ReadonlySet<ChangeState> = new Set(['new', 'worsened', 'resolved', 'improved'])

export function evaluateMeaningfulChange(summary: ChangeSummary): MeaningfulChangeResult {
  const reasons: MeaningfulChangeReason[] = []

  if (summary.findingChanges.some((c) => c.state === 'new' && MEANINGFUL_NEW_OR_WORSENED_SEVERITIES.has(c.severity))) {
    reasons.push('new_high_severity_finding')
  }
  if (summary.findingChanges.some((c) => c.state === 'worsened' && MEANINGFUL_NEW_OR_WORSENED_SEVERITIES.has(c.severity))) {
    reasons.push('worsened_high_severity_finding')
  }
  if (summary.counts.resolved > 0) reasons.push('resolved_finding')
  if (summary.counts.improved > 0) reasons.push('improved_finding')

  if (summary.overallHealth.comparability === 'comparable' && summary.overallHealth.delta !== null) {
    if (summary.overallHealth.delta <= -MEANINGFUL_HEALTH_DELTA_THRESHOLD) reasons.push('overall_health_declined')
    else if (summary.overallHealth.delta >= MEANINGFUL_HEALTH_DELTA_THRESHOLD) reasons.push('overall_health_improved')
  }

  const comparablePillarDeltas = summary.pillarDeltas.filter((d) => d.comparability === 'comparable' && d.delta !== null)
  if (comparablePillarDeltas.some((d) => d.delta! <= -MEANINGFUL_PILLAR_DELTA_THRESHOLD)) reasons.push('pillar_score_declined')
  if (comparablePillarDeltas.some((d) => d.delta! >= MEANINGFUL_PILLAR_DELTA_THRESHOLD)) reasons.push('pillar_score_improved')

  if (summary.counts.unverified >= MEANINGFUL_UNVERIFIED_COUNT_THRESHOLD) reasons.push('coverage_degraded')

  return { meaningful: reasons.length > 0, reasons }
}

export type EventFindingSummary = { title: string; severity: Severity; state: ChangeState }

/**
 * The compact, capped (<=5) "top findings" slice persisted directly on a
 * monitoring_events row (see the migration) so email rendering never needs
 * a second comparison/evidence query. Only NOTIFIABLE_STATES are eligible
 * — persistent/unverified findings are visible in-app but never listed in
 * a notification. Sorted most-severe-first via the SAME shared ordering
 * the "Since Last Scan" UI card uses, so a customer never sees the two
 * surfaces disagree about which findings matter most.
 */
export function selectTopFindingsForEvent(findingChanges: FindingChange[], limit = 5): EventFindingSummary[] {
  const eligible = findingChanges.filter((c) => NOTIFIABLE_STATES.has(c.state))
  return sortFindingChangesBySeverity(eligible)
    .slice(0, limit)
    .map((c) => ({ title: c.title, severity: c.severity, state: c.state }))
}
