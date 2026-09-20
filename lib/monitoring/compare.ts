import { CANONICAL_PILLARS, type CanonicalSnapshot, type CanonicalPillar, type SnapshotFinding, type Severity } from './types'

/**
 * Sprint 2, Prompt 1 — MONITORING FOUNDATION. Deterministic comparison of
 * two CanonicalSnapshots (see types.ts). Pure — no I/O, no Supabase, no AI
 * — so the entire change-detection contract is unit-testable without a
 * live database, mirroring this codebase's established "test the pure
 * logic directly" convention (e.g. lib/entitlements/subscription.ts).
 *
 * OPPORTUNITIES ARE EXCLUDED: the snapshot builder (scan-history.ts) never
 * includes `kind: 'opportunity'` findings in a snapshot's `findings` array
 * at all — an opportunity appearing or disappearing is not a "regression"
 * or a "fix" in the sense this module reasons about, and every existing
 * engine already treats opportunities as a category deliberately excluded
 * from health/priority (see lib/category-engine/health.ts). This module
 * therefore only ever classifies genuine problems.
 */

export type ChangeState = 'new' | 'resolved' | 'persistent' | 'worsened' | 'improved' | 'unverified'

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export type FindingChange = {
  fingerprint: string
  state: ChangeState
  pillar: CanonicalPillar
  checkKey: string
  title: string
  /** The finding's OWN current-facing values — from `current` when present, otherwise from `previous` (e.g. for a 'resolved' or 'unverified' finding, which no longer exists in `current`). */
  severity: Severity
  actionability: string
  /** Only populated for 'worsened'/'improved' — the exact severity movement, never fabricated for any other state. */
  severityChange: { from: Severity; to: Severity } | null
}

export type PillarScoreDelta = {
  pillar: CanonicalPillar
  previousScore: number | null
  currentScore: number | null
  /** Null exactly when comparability is 'not_comparable' — never a fabricated 0. */
  delta: number | null
  comparability: 'comparable' | 'not_comparable'
}

export type OverallHealthDelta = {
  previousScore: number | null
  currentScore: number | null
  delta: number | null
  comparability: 'comparable' | 'not_comparable'
}

export type ChangeSummary = {
  previousCrawlRunId: string
  currentCrawlRunId: string
  previousCompletedAt: string | null
  currentCompletedAt: string | null
  overallHealth: OverallHealthDelta
  pillarDeltas: PillarScoreDelta[]
  findingChanges: FindingChange[]
  counts: {
    new: number
    resolved: number
    persistent: number
    worsened: number
    improved: number
    unverified: number
  }
}

/**
 * Whether a page-scoped finding's disappearance in `current` can be
 * trusted as an actual fix, vs. simply "that page was not re-analyzed this
 * time" (Step 5 — the P0 coverage-awareness requirement: webioom must
 * never claim "Fixed!" when the later scan just didn't look). A
 * site-scoped finding's coverage is the pillar's own analyzed/not_analyzed
 * status; a page-scoped finding additionally requires its specific page to
 * be in `current`'s own analyzed-page set.
 */
function wasCoveredIn(finding: SnapshotFinding, snapshot: CanonicalSnapshot): boolean {
  const pillarCoverage = snapshot.pillars[finding.pillar]?.coverage
  if (pillarCoverage !== 'analyzed') return false
  if (finding.scope === 'site') return true
  if (!finding.instance) return false
  return snapshot.analyzedPageUrls.has(finding.instance.url)
}

function classifySeverityMovement(previous: Severity, current: Severity): 'worsened' | 'improved' | 'persistent' {
  const previousRank = SEVERITY_RANK[previous]
  const currentRank = SEVERITY_RANK[current]
  if (currentRank < previousRank) return 'worsened' // lower rank number = more severe
  if (currentRank > previousRank) return 'improved'
  return 'persistent'
}

function compareFindings(previous: CanonicalSnapshot, current: CanonicalSnapshot): FindingChange[] {
  const previousByFingerprint = new Map<string, SnapshotFinding>()
  for (const pillar of CANONICAL_PILLARS) {
    for (const finding of previous.pillars[pillar]?.findings ?? []) {
      previousByFingerprint.set(finding.fingerprint, finding)
    }
  }

  const currentByFingerprint = new Map<string, SnapshotFinding>()
  for (const pillar of CANONICAL_PILLARS) {
    for (const finding of current.pillars[pillar]?.findings ?? []) {
      currentByFingerprint.set(finding.fingerprint, finding)
    }
  }

  const changes: FindingChange[] = []

  for (const [fingerprint, currentFinding] of currentByFingerprint) {
    const previousFinding = previousByFingerprint.get(fingerprint)

    if (!previousFinding) {
      changes.push({
        fingerprint,
        state: 'new',
        pillar: currentFinding.pillar,
        checkKey: currentFinding.checkKey,
        title: currentFinding.title,
        severity: currentFinding.severity,
        actionability: currentFinding.actionability,
        severityChange: null,
      })
      continue
    }

    const movement = classifySeverityMovement(previousFinding.severity, currentFinding.severity)
    changes.push({
      fingerprint,
      state: movement,
      pillar: currentFinding.pillar,
      checkKey: currentFinding.checkKey,
      title: currentFinding.title,
      severity: currentFinding.severity,
      actionability: currentFinding.actionability,
      severityChange: movement === 'persistent' ? null : { from: previousFinding.severity, to: currentFinding.severity },
    })
  }

  for (const [fingerprint, previousFinding] of previousByFingerprint) {
    if (currentByFingerprint.has(fingerprint)) continue // already handled above

    const resolved = wasCoveredIn(previousFinding, current)
    changes.push({
      fingerprint,
      state: resolved ? 'resolved' : 'unverified',
      pillar: previousFinding.pillar,
      checkKey: previousFinding.checkKey,
      title: previousFinding.title,
      severity: previousFinding.severity,
      actionability: previousFinding.actionability,
      severityChange: null,
    })
  }

  return changes
}

function comparePillarScore(pillar: CanonicalPillar, previous: CanonicalSnapshot, current: CanonicalSnapshot): PillarScoreDelta {
  const previousPillar = previous.pillars[pillar]
  const currentPillar = current.pillars[pillar]

  if (previousPillar.coverage !== 'analyzed' || currentPillar.coverage !== 'analyzed' || previousPillar.healthScore === null || currentPillar.healthScore === null) {
    return { pillar, previousScore: previousPillar.healthScore, currentScore: currentPillar.healthScore, delta: null, comparability: 'not_comparable' }
  }

  return {
    pillar,
    previousScore: previousPillar.healthScore,
    currentScore: currentPillar.healthScore,
    delta: currentPillar.healthScore - previousPillar.healthScore,
    comparability: 'comparable',
  }
}

function compareOverallHealth(previous: CanonicalSnapshot, current: CanonicalSnapshot): OverallHealthDelta {
  const previousScore = previous.overallHealth.score
  const currentScore = current.overallHealth.score

  if (previousScore === null || currentScore === null) {
    return { previousScore, currentScore, delta: null, comparability: 'not_comparable' }
  }

  return { previousScore, currentScore, delta: currentScore - previousScore, comparability: 'comparable' }
}

/**
 * Shared ordering for "which findings matter most" — most severe first.
 * Used by both the "Since Last Scan" UI card and the monitoring email/event
 * builder (lib/monitoring/notification-rules.ts) so a customer never sees
 * two different orderings of the same underlying changes depending on
 * which surface they're looking at.
 */
export function sortFindingChangesBySeverity(changes: FindingChange[]): FindingChange[] {
  return [...changes].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/**
 * The one entry point every consumer (Overview's "Since last scan" card,
 * the history page, a future scheduled-monitoring notification) should
 * call — never re-implement comparison logic at a call site.
 */
export function buildChangeSummary(previous: CanonicalSnapshot, current: CanonicalSnapshot): ChangeSummary {
  const findingChanges = compareFindings(previous, current)

  const counts = { new: 0, resolved: 0, persistent: 0, worsened: 0, improved: 0, unverified: 0 }
  for (const change of findingChanges) {
    counts[change.state] += 1
  }

  return {
    previousCrawlRunId: previous.crawlRunId,
    currentCrawlRunId: current.crawlRunId,
    previousCompletedAt: previous.completedAt,
    currentCompletedAt: current.completedAt,
    overallHealth: compareOverallHealth(previous, current),
    pillarDeltas: CANONICAL_PILLARS.map((pillar) => comparePillarScore(pillar, previous, current)),
    findingChanges,
    counts,
  }
}
