import { describe, expect, it } from 'vitest'
import { selectComparisonPair, type ScanListItem } from '@/app/dashboard/websites/[id]/scan-history'

function scan(id: string, completedAt: string): ScanListItem {
  return { crawlRunId: id, status: 'completed', completedAt, isPartial: false }
}

describe('selectComparisonPair', () => {
  it('BASELINE: zero scans produces no pair at all', () => {
    expect(selectComparisonPair([])).toBeNull()
  })

  it('BASELINE: exactly one completed scan has no previous to compare against — the caller must show an honest "baseline created" state, never a fabricated comparison', () => {
    const result = selectComparisonPair([scan('run-1', '2026-01-01T00:00:00Z')])
    expect(result).not.toBeNull()
    expect(result?.current.crawlRunId).toBe('run-1')
    expect(result?.previous).toBeNull()
  })

  it('two or more scans (most-recent-first input) picks the newest as current and the second-newest as previous', () => {
    const result = selectComparisonPair([scan('run-3', '2026-03-01T00:00:00Z'), scan('run-2', '2026-02-01T00:00:00Z'), scan('run-1', '2026-01-01T00:00:00Z')])
    expect(result?.current.crawlRunId).toBe('run-3')
    expect(result?.previous?.crawlRunId).toBe('run-2')
  })
})
