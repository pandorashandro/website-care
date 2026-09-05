'use client'

import { useActionState, useState } from 'react'
import { disconnectWix, type DisconnectWixState } from './wix-actions'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'
import Card from '@/components/ui/card'

const initialState: DisconnectWixState = null

export default function DisconnectWixButton({ websiteId }: { websiteId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(disconnectWix, initialState)

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Disconnect Wix
      </Button>
    )
  }

  return (
    <Card padding="sm" className="space-y-3 bg-surface-muted">
      <p className="text-xs text-gray-700">
        Scanning and reports will continue to work. Supported direct fixes will be unavailable until Wix
        is connected again.
      </p>
      <p className="text-xs text-muted">
        This removes the stored connection from webioom. It does not uninstall webioom from your Wix
        site — you can also remove the app directly from your Wix dashboard.
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
