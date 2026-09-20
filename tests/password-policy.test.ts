import { describe, expect, it } from 'vitest'
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'

describe('validateNewPassword', () => {
  it('rejects a password shorter than the minimum length', () => {
    const result = validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1), 'a'.repeat(MIN_PASSWORD_LENGTH - 1))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain(`${MIN_PASSWORD_LENGTH} characters`)
  })

  it('accepts a password exactly at the minimum length when it matches the confirmation', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH)
    expect(validateNewPassword(password, password)).toEqual({ ok: true })
  })

  it('rejects when the password and confirmation do not match', () => {
    const result = validateNewPassword('correct-password', 'different-password')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('do not match')
  })

  it('accepts a long, matching password', () => {
    const password = 'a-genuinely-long-password-123'
    expect(validateNewPassword(password, password)).toEqual({ ok: true })
  })

  it('checks length before checking the confirmation match, so a too-short mismatched pair reports the length error first', () => {
    const result = validateNewPassword('ab', 'cd')
    expect(result.ok === false && result.message).toContain('characters')
  })
})
