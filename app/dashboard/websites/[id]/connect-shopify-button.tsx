'use client'

import { useActionState, useState } from 'react'
import { initiateShopifyConnect, type InitiateShopifyConnectState } from './shopify-oauth-actions'
import Modal from '@/components/ui/modal'
import { Input, Label } from '@/components/ui/input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

const initialState: InitiateShopifyConnectState = null

/**
 * Unlike WordPress's Connect flow, a successful submission here never
 * resolves to a client-visible "success" state — initiateShopifyConnect
 * redirects the whole page to Shopify's own authorize screen on success, so
 * the modal simply stays open (and the browser navigates away) until then.
 * Only the error case ever renders back into this component.
 */
export default function ConnectShopifyButton({ websiteId }: { websiteId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(initiateShopifyConnect, initialState)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Connect Shopify
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Connect Shopify"
        description="You'll be redirected to Shopify to approve access, then brought back here."
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="websiteId" value={websiteId} />

          <div>
            <Label htmlFor="shopDomain">Shopify store address</Label>
            <Input
              id="shopDomain"
              name="shopDomain"
              type="text"
              autoComplete="off"
              placeholder="your-store.myshopify.com"
              required
              className="mt-1"
            />
          </div>

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
              {pending ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
