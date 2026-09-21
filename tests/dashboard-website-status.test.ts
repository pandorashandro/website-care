import { describe, expect, it } from 'vitest'
import { deriveDashboardWebsiteStatus } from '@/app/dashboard/dashboard-website-status'
import type { OverallWebsiteHealth } from '@/lib/category-engine/overall-health'

function health(score: number | null): OverallWebsiteHealth {
  return { score, contributingCategoryCount: score === null ? 0 : 7, totalCanonicalCategories: 7 }
}

describe('deriveDashboardWebsiteStatus — Sprint 3, Prompt 2B Dashboard canonical-data fix', () => {
  it('a queued crawl is "scanning"', () => {
    expect(deriveDashboardWebsiteStatus({ status: 'queued' }, health(null))).toBe('scanning')
  })

  it('a running crawl is "scanning"', () => {
    expect(deriveDashboardWebsiteStatus({ status: 'running' }, health(null))).toBe('scanning')
  })

  it('a failed crawl is "failed", even if a stale health score somehow exists', () => {
    expect(deriveDashboardWebsiteStatus({ status: 'failed' }, health(80))).toBe('failed')
  })

  it('a completed crawl with a real canonical score is "analyzed"', () => {
    expect(deriveDashboardWebsiteStatus({ status: 'completed' }, health(86))).toBe('analyzed')
  })

  it('a partial crawl with a real canonical score is still "analyzed" — partial coverage is disclosed elsewhere, not hidden by the status itself', () => {
    expect(deriveDashboardWebsiteStatus({ status: 'partial' }, health(72))).toBe('analyzed')
  })

  it('no crawl at all and no score is "not_scanned"', () => {
    expect(deriveDashboardWebsiteStatus(null, health(null))).toBe('not_scanned')
  })

  it('a terminal crawl exists but no canonical score yet falls back to "scanning" rather than falsely claiming "not scanned"', () => {
    expect(deriveDashboardWebsiteStatus({ status: 'completed' }, health(null))).toBe('scanning')
  })
})
