import { Globe } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import ConnectWixButton from '@/app/dashboard/websites/[id]/connect-wix-button'
import DisconnectWixButton from '@/app/dashboard/websites/[id]/disconnect-wix-button'
import type { WixConnectionStatus } from '@/app/dashboard/websites/[id]/wix-connection-status'

const SUPPORTED_FIXES = ['Blog post title', 'Blog post meta description', 'Store product title', 'Store product meta description']

/**
 * The Wix counterpart to ShopifyIntegrationCard/WordPressIntegrationCard —
 * same structure and trust-copy conventions (status, what connecting
 * unlocks, Connect/Disconnect action). Deliberately does NOT show a
 * capability/scope list the way WordPress's card does: Wix's permission
 * model is a single, fixed, app-wide set (see
 * docs/wix-api-research.md §8) with no per-connection scope list to
 * display, unlike WordPress's four REST capabilities. "Needs attention"
 * (connected but not connectionValid) offers Connect again rather than a
 * separate Reconnect flow — the install callback upserts on website_id,
 * so re-running Connect while already connected safely refreshes the
 * connection in place, exactly mirroring how Shopify's card handles the
 * same case.
 *
 * H1 and Image Alt are intentionally absent from SUPPORTED_FIXES: Wix has
 * no H1 fix policy at all (unrepresentable in
 * lib/integrations/wix/capabilities.ts's WixFixFamily type) and Image Alt
 * is unsupported/unproven. Static Page is also intentionally absent — only
 * Blog Post and Store Product are ever resolvable (see
 * lib/integrations/wix/resource-mapping.ts).
 */
export default function WixIntegrationCard({
  websiteId,
  wixConnection,
}: {
  websiteId: string
  wixConnection: WixConnectionStatus
}) {
  const statusColor = !wixConnection.connected
    ? 'var(--color-border-strong)'
    : wixConnection.connectionValid
      ? 'var(--color-success)'
      : 'var(--color-warning)'

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="h-1 w-full" style={{ backgroundColor: statusColor }} aria-hidden="true" />
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
            <Globe className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Wix</h2>
              {!wixConnection.connected ? (
                <Badge tone="neutral">Not connected</Badge>
              ) : wixConnection.connectionValid ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Needs attention</Badge>
              )}
            </div>
            {wixConnection.connected && wixConnection.connectionValid && wixConnection.siteDisplayName && (
              <p className="mt-0.5 text-sm text-muted">as {wixConnection.siteDisplayName}</p>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">What connecting unlocks</p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
            {SUPPORTED_FIXES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {wixConnection.connected && !wixConnection.connectionValid && (
          <Alert tone="warning" className="mt-4">
            webioom could not verify this Wix connection. It may need to be reconnected.
          </Alert>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {wixConnection.connected ? (
            <>
              {!wixConnection.connectionValid && <ConnectWixButton websiteId={websiteId} />}
              <DisconnectWixButton websiteId={websiteId} />
            </>
          ) : (
            <ConnectWixButton websiteId={websiteId} />
          )}
        </div>
      </div>
    </Card>
  )
}
