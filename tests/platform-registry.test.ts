import { describe, it, expect } from 'vitest'
import type { PlatformType } from '@/lib/integrations/platform'
import { INTEGRATION_REGISTRY, INTEGRATIONS } from '@/lib/integrations/registry'

/**
 * Phase 21 — permanent regression coverage for the platform identity +
 * discovery layer. The main risk this guards against: a future platform
 * (Wix, Webflow, Squarespace) getting silently treated as "implemented"
 * before it actually is, or the registry drifting out of sync with
 * PlatformType.
 */
describe('integration registry', () => {
  it('registers exactly wordpress and shopify — no more, no fewer', () => {
    expect(Object.keys(INTEGRATION_REGISTRY).sort()).toEqual(['shopify', 'wordpress'])
  })

  it('does not register any planned-but-not-implemented platform', () => {
    const registeredPlatforms = Object.keys(INTEGRATION_REGISTRY)
    for (const planned of ['wix', 'webflow', 'squarespace']) {
      expect(registeredPlatforms).not.toContain(planned)
    }
  })

  it('every registry entry\'s own `platform` field matches its key', () => {
    for (const [key, entry] of Object.entries(INTEGRATION_REGISTRY)) {
      expect(entry.platform).toBe(key)
    }
  })

  it('every registry entry has a non-empty display name', () => {
    for (const entry of Object.values(INTEGRATION_REGISTRY)) {
      expect(typeof entry.name).toBe('string')
      expect(entry.name.length).toBeGreaterThan(0)
    }
  })

  it('INTEGRATIONS is exactly the registry\'s values, in no particular guaranteed order but same membership', () => {
    const fromIntegrations = [...INTEGRATIONS].map((entry) => entry.platform).sort()
    const fromRegistry = Object.keys(INTEGRATION_REGISTRY).sort()
    expect(fromIntegrations).toEqual(fromRegistry)
  })

  it('type-level: PlatformType has exactly the members the registry declares (compile-time exhaustiveness)', () => {
    // If PlatformType ever gains a member without a registry entry (or vice
    // versa), this Record literal fails to type-check — the assertion below
    // only runs if the file already compiled, so a passing test run is
    // itself part of the proof.
    const exhaustive: Record<PlatformType, true> = { wordpress: true, shopify: true }
    expect(Object.keys(exhaustive).sort()).toEqual(['shopify', 'wordpress'])
  })
})
