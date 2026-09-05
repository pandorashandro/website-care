'use client'

import { useActionState, useState } from 'react'
import { initiateWixConnect, type InitiateWixConnectState } from './wix-oauth-actions'
import Modal from '@/components/ui/modal'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

const initialState: InitiateWixConnectState = null

/**
 * Unlike ConnectShopifyButton, there is no domain/site text field here —
 * Wix's External Install Flow has no equivalent free-text entry; the
 * merchant picks (or confirms) the site entirely within Wix's own UI after
 * redirect (see docs/wix-api-research.md §2). A successful submission
 * never resolves to a client-visible "success" state either — it redirects
 * the whole page to Wix's own installer URL — so only the error case ever
 * renders back into this component, mirroring ConnectShopifyButton's own
 * documented behavior for the same reason.
 */
export default function ConnectWixButton({ websiteId }: { websiteId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(initiateWixConnect, initialState)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Connect Wix
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Connect Wix"
        description="You'll be redirected to Wix to choose your site and approve access, then brought back here."
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="websiteId" value={websiteId} />

          {state?.error && <Alert tone="danger">{state.error}</Alert>}

          <p className="text-xs text-muted">
            Credentials are handled server-side and are never displayed back to you. Connecting doesn&apos;t
            apply any changes automatically — supported fixes still require your review and approval.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Connecting…' : 'Continue to Wix'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
