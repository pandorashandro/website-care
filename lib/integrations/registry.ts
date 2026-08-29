import type { PlatformType } from './platform'

/**
 * Phase 19.7 — the integration registry.
 *
 * This is small, plain, discovery/UI metadata — nothing here selects a
 * writer, a server action, a credential, or an API endpoint (that remains
 * explicit and typed in each platform's own orchestration files, e.g.
 * lib/integrations/wordpress/adapter.ts). It answers exactly the questions
 * the current UI actually needs answered: what platform integrations exist,
 * their typed platform identity, and their display name.
 *
 * Deliberately excluded, and why:
 *
 * - No `available`/`connectable` boolean. An integration that isn't real yet
 *   is simply absent from this registry entirely (see below) — there is no
 *   current or near-term state where an entry exists but is unavailable, so
 *   a boolean that would always be `true` today has no concrete consumer.
 * - No description/copy fields. The dashboard card and the public marketing
 *   page each already have their own purpose-specific copy that isn't
 *   interchangeable; unifying them into one shared string would serve no
 *   current consumer and would constrain future platform-specific copy.
 * - No component-path/action-name string. UI routing to a platform-specific
 *   component is an explicit, compile-time-checked map keyed by `platform`
 *   (see components/integrations/integration-list.tsx) — never a string the
 *   registry names and something else resolves dynamically.
 */
export type IntegrationRegistryEntry = {
  platform: PlatformType
  /** Display name for UI that lists integrations generically. */
  name: string
}

/**
 * The single source of truth for which integrations webioom actually
 * implements today. `Record<PlatformType, ...>` is deliberate: if
 * PlatformType ever gains a second member, this object literal fails to
 * type-check until an entry is added for it, so a real future platform can
 * never be silently missing from discovery. The reverse is just as
 * deliberate — nothing may be added here speculatively (no "coming soon"
 * entries), because PlatformType itself only grows when real adapter work
 * begins, per lib/integrations/platform.ts's own rule.
 */
export const INTEGRATION_REGISTRY: Record<PlatformType, IntegrationRegistryEntry> = {
  wordpress: { platform: 'wordpress', name: 'WordPress' },
}

/** Iteration-friendly view of the registry, for generic listing UI. */
export const INTEGRATIONS: readonly IntegrationRegistryEntry[] = Object.values(INTEGRATION_REGISTRY)
