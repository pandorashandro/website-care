import type { PlatformType } from '@/lib/integrations/platform'

/**
 * The exact typed platform identity Shopify fix/rollback actions pass to
 * fix-history.ts's recordFixHistory, mirroring
 * lib/integrations/wordpress/adapter.ts's WORDPRESS_PLATFORM constant —
 * every platform declares exactly one such constant, typed as
 * `PlatformType`, as its single source of truth for "which platform am I."
 *
 * Originally typed as the wider `FixHistoryPlatform` (Phase 20.1F), back
 * when Shopify's backend was real but deliberately not yet registered in
 * lib/integrations/registry.ts (that registration was Phase 20.1H's job).
 * Now that Phase 20.1H has registered Shopify, `PlatformType` itself
 * includes 'shopify', so this is retyped to match WORDPRESS_PLATFORM
 * exactly (Phase 21) — a type-only change, `FixHistoryPlatform` remains a
 * valid (now equivalent) type for this value, so nothing downstream needed
 * to change.
 */
export const SHOPIFY_PLATFORM: PlatformType = 'shopify'
