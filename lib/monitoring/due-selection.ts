/**
 * Sprint 2, Prompt 2 — STEP 3. Pure candidate classification, separated
 * from the Supabase-coupled fetch/claim in due-service.ts so the actual
 * "who is due" decision is unit-testable without a live database —
 * mirrors app/dashboard/websites/[id]/scan-history.ts's own
 * selectComparisonPair/listCompletedScans split.
 */

export type MonitoringSettingsRow = {
  websiteId: string
  monitoringEnabled: boolean
  runStatus: 'idle' | 'running'
  nextDueAt: string | null
  claimedAt: string | null
}

export type DueCandidate = { websiteId: string; claimKind: 'due' | 'stale_reclaim' }

/**
 * A row is claimable as a fresh 'due' candidate only when monitoring is
 * enabled, no run is currently in flight (`runStatus: 'idle'`), and
 * `nextDueAt` has actually arrived. A row already `runStatus: 'running'`
 * is claimable ONLY as a stale reclaim (its claim is older than
 * `staleThresholdIso`) — never merely because it is also past its
 * `nextDueAt`, since a legitimately still-running attempt must never be
 * treated as a second due opportunity.
 */
export function selectDueCandidates(rows: MonitoringSettingsRow[], nowIso: string, staleThresholdIso: string): DueCandidate[] {
  const candidates: DueCandidate[] = []

  for (const row of rows) {
    if (!row.monitoringEnabled) continue

    if (row.runStatus === 'idle') {
      if (row.nextDueAt !== null && row.nextDueAt <= nowIso) {
        candidates.push({ websiteId: row.websiteId, claimKind: 'due' })
      }
      continue
    }

    // runStatus === 'running'
    if (row.claimedAt !== null && row.claimedAt < staleThresholdIso) {
      candidates.push({ websiteId: row.websiteId, claimKind: 'stale_reclaim' })
    }
  }

  return candidates
}
