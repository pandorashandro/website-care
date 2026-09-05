import type { FixHistoryPlatform } from '@/lib/integrations/platform'

/**
 * The exact typed platform identity Wix fix/rollback actions pass to
 * fix-history.ts's recordFixHistory, mirroring
 * lib/integrations/wordpress/adapter.ts's WORDPRESS_PLATFORM and
 * lib/integrations/shopify/platform.ts's SHOPIFY_PLATFORM constants.
 *
 * Typed as `FixHistoryPlatform` (not `PlatformType`) — `PlatformType`
 * itself does not include `'wix'` yet, deliberately: Wix is not registered
 * in lib/integrations/registry.ts, and per this phase's brief, registry
 * exposure should wait for a dedicated frontend phase (Prompt 3) even
 * though the backend Safe Fix capability this constant supports is now
 * real and complete. This mirrors exactly how SHOPIFY_PLATFORM was typed
 * during Shopify's own 20.1A-20.1E phases, before Shopify was added to
 * PlatformType.
 */
export const WIX_PLATFORM: FixHistoryPlatform = 'wix'
