import { Plug } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Alert from '@/components/ui/alert'
import WordPressCapabilityList from './wordpress-capability-list'
import ConnectWordPressButton from '@/app/dashboard/websites/[id]/connect-wordpress-button'
import DisconnectWordPressButton from '@/app/dashboard/websites/[id]/disconnect-wordpress-button'
import type { WordPressDetectionResult } from '@/lib/integrations/wordpress/detect-wordpress'
import type { WordPressConnectionSummary } from '@/app/dashboard/websites/[id]/wordpress-capabilities'

const SUPPORTED_FIXES = [
  'Page title',
  'Meta description, where a supported SEO provider/configuration is detected',
  'Missing H1, where webioom can safely confirm the editable source',
  'Missing image alt text, where webioom can safely confirm the image and its source',
]

/**
 * The full WordPress integration card — status, what connecting unlocks,
 * capabilities (when connected), and the actual Connect/Disconnect action.
 * This is the only place those two buttons render; the Website Overview
 * page only ever shows a summary that links here, so there is exactly one
 * connect form and one disconnect action in the product.
 */
export default function WordPressIntegrationCard({
  websiteId,
  wordpress,
  wordpressConnection,
}: {
  websiteId: string
  wordpress: WordPressDetectionResult
  wordpressConnection: WordPressConnectionSummary
}) {
  const statusColor = !wordpressConnection.connected
    ? 'var(--color-border-strong)'
    : wordpressConnection.connectionValid
      ? 'var(--color-success)'
      : 'var(--color-warning)'

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="h-1 w-full" style={{ backgroundColor: statusColor }} aria-hidden="true" />
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
            <Plug className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">WordPress</h2>
              {!wordpressConnection.connected ? (
                <Badge tone="neutral">Not connected</Badge>
              ) : wordpressConnection.connectionValid ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Needs attention</Badge>
              )}
            </div>
            {wordpressConnection.connected && wordpressConnection.displayName && (
              <p className="mt-0.5 text-sm text-muted">as {wordpressConnection.displayName}</p>
            )}
          </div>
        </div>

        {!wordpressConnection.connected && wordpress.status === 'unknown' && (
          <p className="mt-3 text-sm text-muted">webioom hasn&apos;t confirmed this website runs WordPress, but you can still connect if it does.</p>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">What connecting unlocks</p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
            {SUPPORTED_FIXES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {wordpressConnection.connected && !wordpressConnection.connectionValid && (
          <Alert tone="warning" className="mt-4">
            webioom could not verify this WordPress connection. It may need to be reconnected.
          </Alert>
        )}

        {wordpressConnection.connected && wordpressConnection.connectionValid && (
          <div className="mt-4 border-t border-border pt-4">
            <WordPressCapabilityList capabilities={wordpressConnection.capabilities} />
          </div>
        )}

        <div className="mt-5">
          {wordpressConnection.connected ? (
            <DisconnectWordPressButton websiteId={websiteId} />
          ) : (
            <ConnectWordPressButton websiteId={websiteId} />
          )}
        </div>
      </div>
    </Card>
  )
}
