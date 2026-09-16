import { describe, expect, it } from 'vitest'
import { CHECK_ACTIONABILITY, getActionability } from '@/lib/technical-seo/actionability'
import type { CheckKey } from '@/lib/technical-seo/types'

/**
 * Phase 26B, Checkpoint 8 — "do not falsely mark a Technical SEO issue
 * SAFE_FIX simply because it would be nice to automate." This is the one
 * global, always-true invariant every check in the library must satisfy
 * today: no Technical SEO check has a real execution backend yet, so NONE
 * may claim 'safe_fix' or 'prepared_fix'.
 */
describe('actionability classification (Checkpoint 8)', () => {
  it('no check is classified safe_fix or prepared_fix — no current backend can execute any Technical SEO change automatically', () => {
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
    const key: CheckKey = 'fetch_failed'
    expect(getActionability(key)).toBe(CHECK_ACTIONABILITY[key])
  })
})
