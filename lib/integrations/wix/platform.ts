import type { PlatformType } from '@/lib/integrations/platform'

/**
 * The exact typed platform identity Wix fix/rollback actions pass to
 * fix-history.ts's recordFixHistory, mirroring
 * lib/integrations/wordpress/adapter.ts's WORDPRESS_PLATFORM and
 * lib/integrations/shopify/platform.ts's SHOPIFY_PLATFORM constants.
 *
 * Typed as `PlatformType` (widened from `FixHistoryPlatform` during Wix V1
 * Prompt 3, once Wix was registered in lib/integrations/registry.ts) —
 * mirroring the exact symmetry fix SHOPIFY_PLATFORM already went through
 * once Shopify itself was registered.
 */
export const WIX_PLATFORM: PlatformType = 'wix'
