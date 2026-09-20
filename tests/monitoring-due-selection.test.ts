import { describe, expect, it } from 'vitest'
import { selectDueCandidates, type MonitoringSettingsRow } from '@/lib/monitoring/due-selection'

const NOW = '2026-06-01T12:00:00.000Z'
const STALE_THRESHOLD = '2026-06-01T11:45:00.000Z' // 15 minutes before NOW

function row(overrides: Partial<MonitoringSettingsRow>): MonitoringSettingsRow {
  return { websiteId: 'website-1', monitoringEnabled: true, runStatus: 'idle', nextDueAt: null, claimedAt: null, ...overrides }
}

describe('selectDueCandidates', () => {
  it('DISABLED WEBSITE NOT DUE: monitoring_enabled = false is never a candidate, even if next_due_at is in the past', () => {
    const rows = [row({ monitoringEnabled: false, nextDueAt: '2026-05-01T00:00:00.000Z' })]
    expect(selectDueCandidates(rows, NOW, STALE_THRESHOLD)).toEqual([])
  })

  it('ENABLED DUE WEBSITE SELECTED: idle + next_due_at in the past is a fresh due candidate', () => {
    const rows = [row({ nextDueAt: '2026-05-01T00:00:00.000Z' })]
    expect(selectDueCandidates(rows, NOW, STALE_THRESHOLD)).toEqual([{ websiteId: 'website-1', claimKind: 'due' }])
  })

  it('FUTURE NEXT_DUE_AT EXCLUDED: idle but not yet due is never a candidate', () => {
    const rows = [row({ nextDueAt: '2026-07-01T00:00:00.000Z' })]
    expect(selectDueCandidates(rows, NOW, STALE_THRESHOLD)).toEqual([])
  })

  it('idle with next_due_at = null (never scheduled) is never a candidate', () => {
    const rows = [row({ nextDueAt: null })]
    expect(selectDueCandidates(rows, NOW, STALE_THRESHOLD)).toEqual([])
  })

  it('PREVIOUS SCAN STILL RUNNING: run_status running and NOT stale is excluded — never treated as a second due opportunity merely because next_due_at also passed', () => {
    const rows = [row({ runStatus: 'running', claimedAt: '2026-06-01T11:58:00.000Z', nextDueAt: '2026-05-01T00:00:00.000Z' })]
    expect(selectDueCandidates(rows, NOW, STALE_THRESHOLD)).toEqual([])
  })

  it('a running claim OLDER than the stale threshold becomes reclaimable — recovers from a crashed/timed-out invocation', () => {
    const rows = [row({ runStatus: 'running', claimedAt: '2026-06-01T11:00:00.000Z' })]
    expect(selectDueCandidates(rows, NOW, STALE_THRESHOLD)).toEqual([{ websiteId: 'website-1', claimKind: 'stale_reclaim' }])
  })

  it('DISABLING MONITORING PREVENTS FUTURE EXECUTION: a disabled row stuck in a stale running state is still never a candidate', () => {
    const rows = [row({ monitoringEnabled: false, runStatus: 'running', claimedAt: '2026-06-01T11:00:00.000Z' })]
    expect(selectDueCandidates(rows, NOW, STALE_THRESHOLD)).toEqual([])
  })

  it('multiple websites due simultaneously all appear as separate candidates', () => {
    const rows = [row({ websiteId: 'a', nextDueAt: '2026-05-01T00:00:00.000Z' }), row({ websiteId: 'b', nextDueAt: '2026-05-02T00:00:00.000Z' })]
    const result = selectDueCandidates(rows, NOW, STALE_THRESHOLD)
    expect(result.map((c) => c.websiteId).sort()).toEqual(['a', 'b'])
  })
})
