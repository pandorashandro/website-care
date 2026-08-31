import type { FixHistoryPlatform } from '@/lib/integrations/platform'

/**
 * Phase 20.1F — the exact typed platform identity Shopify fix/rollback
 * actions must pass to fix-history.ts's recordFixHistory, mirroring
 * lib/integrations/wordpress/adapter.ts's WORDPRESS_PLATFORM constant.
 * Typed as `FixHistoryPlatform` (not `PlatformType` — see that type's doc
 * comment in lib/integrations/platform.ts for why) so this constant can
 * exist without implying Shopify is registered in
 * lib/integrations/registry.ts or components/integrations/integration-list.tsx,
 * which remains Phase 20.1H's job.
 */
export const SHOPIFY_PLATFORM: FixHistoryPlatform = 'shopify'
