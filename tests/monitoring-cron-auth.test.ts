import { describe, expect, it } from 'vitest'
import { isAuthorizedBearerToken } from '@/lib/monitoring/cron-auth'

describe('isAuthorizedBearerToken — SCHEDULER AUTHENTICATION', () => {
  it('rejects when no secret is configured at all — fails closed, never falls back to allow', () => {
    expect(isAuthorizedBearerToken('Bearer anything', undefined)).toBe(false)
  })

  it('rejects a missing Authorization header', () => {
    expect(isAuthorizedBearerToken(null, 'real-secret')).toBe(false)
  })

  it('rejects a forged/incorrect token', () => {
    expect(isAuthorizedBearerToken('Bearer wrong-secret', 'real-secret')).toBe(false)
  })

  it('rejects a header missing the Bearer prefix even with the right secret value', () => {
    expect(isAuthorizedBearerToken('real-secret', 'real-secret')).toBe(false)
  })

  it('accepts the exact configured bearer token', () => {
    expect(isAuthorizedBearerToken('Bearer real-secret', 'real-secret')).toBe(true)
  })

  it('TIMING-SAFE COMPARISON: a wrong-length header fails closed without throwing (never falls through to a raw timingSafeEqual length-mismatch exception)', () => {
    expect(() => isAuthorizedBearerToken('Bearer x', 'a-much-longer-real-secret')).not.toThrow()
    expect(isAuthorizedBearerToken('Bearer x', 'a-much-longer-real-secret')).toBe(false)
  })
})
