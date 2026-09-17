import { describe, expect, it } from 'vitest'
import { CHECK_ACTIONABILITY, getActionability } from '@/lib/on-page/actionability'
import type { CheckKey } from '@/lib/on-page/types'

const ALL_CHECK_KEYS: CheckKey[] = Object.keys(CHECK_ACTIONABILITY) as CheckKey[]

describe('On-Page SEO actionability — reflects actual wired backend capability only', () => {
  it('classifies every check key (compile-time enforced by satisfies, verified here at runtime too)', () => {
    expect(ALL_CHECK_KEYS).toHaveLength(11)
    for (const key of ALL_CHECK_KEYS) {
      expect(getActionability(key)).toBeDefined()
    }
  })

  it('marks the three length-based title checks as prepared_fix — a real wired Preview/Apply/Verify/Rollback path exists (lib/fixes/title-preview.ts\'s closed TitleIssueKind)', () => {
    expect(getActionability('missing_title')).toBe('prepared_fix')
    expect(getActionability('title_too_short')).toBe('prepared_fix')
    expect(getActionability('title_too_long')).toBe('prepared_fix')
  })

  it('marks weak_title and duplicate_title as guided_fix — outside the existing TitleIssueKind union, no wired Apply path', () => {
    expect(getActionability('weak_title')).toBe('guided_fix')
    expect(getActionability('duplicate_title')).toBe('guided_fix')
  })

  it('marks the three length-based meta-description checks as prepared_fix — a real wired Apply/Rollback path exists', () => {
    expect(getActionability('missing_meta_description')).toBe('prepared_fix')
    expect(getActionability('meta_description_too_short')).toBe('prepared_fix')
    expect(getActionability('meta_description_too_long')).toBe('prepared_fix')
  })

  it('marks duplicate_meta_description as guided_fix — same reasoning as duplicate_title', () => {
    expect(getActionability('duplicate_meta_description')).toBe('guided_fix')
  })

  it('marks missing_h1 as prepared_fix — the existing insertion-only H1 write path is unambiguous', () => {
    expect(getActionability('missing_h1')).toBe('prepared_fix')
  })

  it('marks multiple_h1 as guided_fix — confirmed diagnostic-only, no destructive/restructuring write path exists', () => {
    expect(getActionability('multiple_h1')).toBe('guided_fix')
  })

  it('never assigns safe_fix — no On-Page check has a fully-automatic (no-approval) write path', () => {
    expect(ALL_CHECK_KEYS.every((key) => getActionability(key) !== 'safe_fix')).toBe(true)
  })
})
