'use client'

import { useActionState, useState } from 'react'
import { disconnectWordPress, type DisconnectWordPressState } from './wordpress-actions'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'
import Card from '@/components/ui/card'

const initialState: DisconnectWordPressState = null

export default function DisconnectWordPressButton({ websiteId }: { websiteId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(disconnectWordPress, initialState)

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Disconnect WordPress
      </Button>
    )
  }

  return (
    <Card padding="sm" className="space-y-3 bg-surface-muted">
      <p className="text-xs text-gray-700">
        Scanning and reports will continue to work. Supported direct fixes will be unavailable until
        WordPress is connected again.
      </p>
      <p className="text-xs text-muted">
        This removes the stored connection from Website Care. It does not necessarily revoke the
        Application Password inside WordPress — you can also revoke it from your WordPress admin area.
      </p>

      <form action={formAction}>
        <input type="hidden" name="websiteId" value={websiteId} />

        {state?.error && <Alert tone="danger" className="mb-3">{state.error}</Alert>}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {pending ? 'Disconnecting…' : 'Yes, disconnect'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
