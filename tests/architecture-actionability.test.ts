import { describe, expect, it } from 'vitest'
import { CHECK_ACTIONABILITY, getActionability } from '@/lib/architecture/actionability'
import type { CheckKey } from '@/lib/architecture/types'

describe('Site Architecture actionability classification', () => {
  it('no check is classified safe_fix or prepared_fix — no current backend can execute a link/navigation change automatically', () => {
    for (const [checkKey, actionability] of Object.entries(CHECK_ACTIONABILITY)) {
      expect(actionability, `${checkKey} must not claim safe_fix`).not.toBe('safe_fix')
      expect(actionability, `${checkKey} must not claim prepared_fix`).not.toBe('prepared_fix')
    }
  })

  it('every classification is one of the five canonical values', () => {
    const validValues = new Set(['safe_fix', 'prepared_fix', 'guided_fix', 'developer_required', 'monitor'])
    for (const actionability of Object.values(CHECK_ACTIONABILITY)) {
      expect(validValues.has(actionability)).toBe(true)
    }
  })

  it('getActionability looks up the same map', () => {
    const key: CheckKey = 'orphan_page'
    expect(getActionability(key)).toBe(CHECK_ACTIONABILITY[key])
  })

  it('dead_end_page is monitor, matching this phase\'s own guidance for a check with high false-positive risk', () => {
    expect(CHECK_ACTIONABILITY.dead_end_page).toBe('monitor')
  })
})
