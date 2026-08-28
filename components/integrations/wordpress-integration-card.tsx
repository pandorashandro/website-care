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
  'Missing H1, where Website Care can safely confirm the editable source',
  'Missing image alt text, where Website Care can safely confirm the image and its source',
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
  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
          <Plug className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">WordPress</h2>
        <Badge tone="brand">Integration #1</Badge>
        <Badge tone="success">Available</Badge>
      </div>

      <div className="mt-4">
        {!wordpressConnection.connected ? (
          <Badge tone="neutral">Not connected</Badge>
        ) : wordpressConnection.connectionValid ? (
          <Badge tone="success">Connected</Badge>
        ) : (
          <Badge tone="warning">Connection needs attention</Badge>
        )}
        {wordpressConnection.connected && wordpressConnection.displayName && (
          <span className="ml-2 text-sm text-muted">as {wordpressConnection.displayName}</span>
        )}
      </div>

      {!wordpressConnection.connected && wordpress.status === 'unknown' && (
        <p className="mt-2 text-sm text-muted">
          Website Care hasn&apos;t confirmed this website runs WordPress from scanning it, but you can still
          connect if it does.
        </p>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">What connecting unlocks</p>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
          {SUPPORTED_FIXES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Supported fixes depend on the page, permissions, and configuration. Every other issue still gets a
          clear recommendation, connected or not.
        </p>
      </div>

      {wordpressConnection.connected && !wordpressConnection.connectionValid && (
        <Alert tone="warning" className="mt-4">
          Website Care could not verify this WordPress connection. It may need to be reconnected.
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
    </Card>
  )
}
