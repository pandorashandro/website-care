import type { CapabilityValue, WordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'

const CAPABILITY_ROWS: { key: keyof WordPressCapabilities; label: string }[] = [
  { key: 'canEditPages', label: 'Page editing' },
  { key: 'canEditPosts', label: 'Post editing' },
  { key: 'canPublishPosts', label: 'Publishing' },
  { key: 'canUploadMedia', label: 'Media access' },
]

const CAPABILITY_LABELS: Record<CapabilityValue, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
}

const CAPABILITY_TEXT_CLASS: Record<CapabilityValue, string> = {
  available: 'font-medium text-green-700',
  unavailable: 'font-medium text-gray-500',
  unknown: 'font-medium text-gray-500',
}

/**
 * Translates the real capabilities model (canEditPages/canEditPosts/
 * canPublishPosts/canUploadMedia, each available/unavailable/unknown) into
 * plain product language. Never invents a capability or a value the backend
 * didn't report.
 */
export default function WordPressCapabilityList({ capabilities }: { capabilities: WordPressCapabilities }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">What the connected account can do</p>
      <p className="mt-1 text-xs text-muted">
        Website Care checks what the connected account is allowed to change before preparing supported
        fixes.
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {CAPABILITY_ROWS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <dt className="text-gray-600">{label}</dt>
            <dd className={CAPABILITY_TEXT_CLASS[capabilities[key]]}>{CAPABILITY_LABELS[capabilities[key]]}</dd>
          </div>
        ))}
      </dl>
      {capabilities.canUploadMedia !== 'available' && (
        <p className="mt-2 text-xs text-muted">
          Media editing isn&apos;t available with this connection, so some image fixes may not be available.
        </p>
      )}
    </div>
  )
}
