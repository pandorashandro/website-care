import { describe, expect, it } from 'vitest'
import { CHECK_ACTIONABILITY, getActionability } from '@/lib/content/actionability'
import type { CheckKey } from '@/lib/content/types'

const ALL_CHECK_KEYS: CheckKey[] = Object.keys(CHECK_ACTIONABILITY) as CheckKey[]

describe('Content Intelligence actionability — reflects actual wired backend capability only', () => {
  it('classifies every check key', () => {
    expect(ALL_CHECK_KEYS).toHaveLength(8)
    for (const key of ALL_CHECK_KEYS) {
      expect(getActionability(key)).toBeDefined()
    }
  })

  it('marks every deterministic content problem as guided_fix — no existing execution path can write arbitrary page body content', () => {
    expect(getActionability('substantively_thin_page')).toBe('guided_fix')
    expect(getActionability('exact_duplicate_content')).toBe('guided_fix')
    expect(getActionability('highly_repetitive_page')).toBe('guided_fix')
    expect(getActionability('weak_content_structure')).toBe('guided_fix')
  })

  it('marks the FAQ opportunity and Page Purpose summary as monitor, not guided_fix — both are informational/suggestions, not required actions', () => {
    expect(getActionability('faq_opportunity')).toBe('monitor')
    expect(getActionability('page_purpose_summary')).toBe('monitor')
  })

  it('marks AI-derived completeness findings guided_fix (problem) / monitor (opportunity) — never prepared_fix, since no execution backend can write page body content', () => {
    expect(getActionability('content_completeness_gap')).toBe('guided_fix')
    expect(getActionability('content_completeness_opportunity')).toBe('monitor')
  })

  it('never assigns safe_fix or prepared_fix — no wired content-body execution backend exists', () => {
    expect(ALL_CHECK_KEYS.every((key) => getActionability(key) !== 'safe_fix' && getActionability(key) !== 'prepared_fix')).toBe(true)
  })
})
