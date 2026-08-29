import type { ReactNode } from 'react'
import type { PlatformType } from '@/lib/integrations/platform'
import type { WordPressDetectionResult } from '@/lib/integrations/wordpress/detect-wordpress'
import type { WordPressConnectionSummary } from '@/app/dashboard/websites/[id]/wordpress-capabilities'
import { INTEGRATIONS } from '@/lib/integrations/registry'
import WordPressIntegrationCard from './wordpress-integration-card'

type IntegrationListProps = {
  websiteId: string
  wordpress: WordPressDetectionResult
  wordpressConnection: WordPressConnectionSummary
}

/**
 * Phase 19.7 — the generic integration-rendering layer. Iterates the small
 * registry (lib/integrations/registry.ts) and dispatches each entry to its
 * own platform-specific card via an explicit, compile-time-exhaustive map —
 * never a dynamic import or a registry-supplied component path/string. Today
 * this renders exactly one card (WordPress, the registry's only entry);
 * adding a second real integration means adding both a registry entry and a
 * renderer here, not restructuring this container.
 *
 * `IntegrationListProps` is intentionally WordPress-shaped today — it is not
 * a premature generic "integration data" contract. When a second platform is
 * actually implemented, `INTEGRATION_CARD_RENDERERS` below will fail to
 * type-check until it's given its own renderer, and that is the right moment
 * to decide what shared vs. platform-specific data that renderer actually
 * needs — not something to guess at now with only one real integration to
 * learn from.
 */
const INTEGRATION_CARD_RENDERERS: Record<PlatformType, (props: IntegrationListProps) => ReactNode> = {
  wordpress: ({ websiteId, wordpress, wordpressConnection }) => (
    <WordPressIntegrationCard websiteId={websiteId} wordpress={wordpress} wordpressConnection={wordpressConnection} />
  ),
}

export default function IntegrationList(props: IntegrationListProps) {
  return (
    <div className="space-y-6">
      {INTEGRATIONS.map((integration) => (
        <div key={integration.platform}>{INTEGRATION_CARD_RENDERERS[integration.platform](props)}</div>
      ))}
    </div>
  )
}
