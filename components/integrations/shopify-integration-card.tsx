import { Store } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import ConnectShopifyButton from '@/app/dashboard/websites/[id]/connect-shopify-button'
import DisconnectShopifyButton from '@/app/dashboard/websites/[id]/disconnect-shopify-button'
import type { ShopifyConnectionStatus } from '@/app/dashboard/websites/[id]/shopify-connection-status'

const SUPPORTED_FIXES = ['Page/product/collection title', 'Meta description, where webioom can safely identify it']

/**
 * The Shopify counterpart to WordPressIntegrationCard — same structure and
 * trust-copy conventions (status, what connecting unlocks, Connect/
 * Disconnect action), adapted for an OAuth connection rather than a
 * username/password form. Deliberately does NOT show a capability list the
 * way WordPress's card does (WordPressCapabilityList): Shopify's real
 * capability policy is resource-type-specific (capabilities.ts) and can
 * only be evaluated per-page at Prepare time, not as a flat account-level
 * list the way WordPress's four REST capabilities are. "Needs attention"
 * (connected but not connectionValid) offers Connect again rather than a
 * separate Reconnect flow — the OAuth callback upserts on website_id, so
 * re-running Connect while already connected safely refreshes the
 * connection in place, exactly mirroring how wordpress_connections is
 * reconnected via its own Connect form.
 *
 * H1 and Image Alt are intentionally absent from SUPPORTED_FIXES: Shopify
 * has no H1 fix policy at all (unrepresentable in
 * lib/integrations/shopify/capabilities.ts's ShopifyFixFamily type) and
 * Image Alt, while modeled in that same policy for a possible future phase,
 * is not implemented or offered anywhere in the product yet.
 */
export default function ShopifyIntegrationCard({
  websiteId,
  shopifyConnection,
}: {
  websiteId: string
  shopifyConnection: ShopifyConnectionStatus
}) {
  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
          <Store className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Shopify</h2>
        <Badge tone="brand">Integration #2</Badge>
        <Badge tone="success">Available</Badge>
      </div>

      <div className="mt-4">
        {!shopifyConnection.connected ? (
          <Badge tone="neutral">Not connected</Badge>
        ) : shopifyConnection.connectionValid ? (
          <Badge tone="success">Connected</Badge>
        ) : (
          <Badge tone="warning">Connection needs attention</Badge>
        )}
        {shopifyConnection.connected && (
          <span className="ml-2 text-sm text-muted">as {shopifyConnection.myshopifyDomain}</span>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">What connecting unlocks</p>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
          {SUPPORTED_FIXES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Supported fixes depend on the resource, permissions, and configuration. Every other issue still
          gets a clear recommendation, connected or not.
        </p>
      </div>

      {shopifyConnection.connected && !shopifyConnection.connectionValid && (
        <Alert tone="warning" className="mt-4">
          webioom could not verify this Shopify connection. It may need to be reconnected.
        </Alert>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {shopifyConnection.connected ? (
          <>
            {!shopifyConnection.connectionValid && <ConnectShopifyButton websiteId={websiteId} />}
            <DisconnectShopifyButton websiteId={websiteId} />
          </>
        ) : (
          <ConnectShopifyButton websiteId={websiteId} />
        )}
      </div>
    </Card>
  )
}
