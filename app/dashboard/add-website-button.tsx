'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { addWebsite, type AddWebsiteState } from './actions'
import Modal from '@/components/ui/modal'
import { Input, Label } from '@/components/ui/input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

const initialState: AddWebsiteState = null

export default function AddWebsiteButton({ label = '+ Add Website' }: { label?: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(addWebsite, initialState)
  const [handledState, setHandledState] = useState(state)
  const formRef = useRef<HTMLFormElement>(null)

  if (state !== handledState) {
    setHandledState(state)

    if (state !== null && !state.error) {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (state !== null && !state.error) {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a website"
        description="Enter the website you want WEBIOOM to scan."
      >
        <form ref={formRef} action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="name">Website name</Label>
            <Input id="name" name="name" type="text" required className="mt-1" placeholder="My Website" />
            <p className="mt-1 text-xs text-subtle">A label to help you recognize this website — it isn&apos;t used for scanning.</p>
          </div>

          <div>
            <Label htmlFor="url">Website URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              required
              className="mt-1"
              placeholder="https://example.com"
            />
            <p className="mt-1 text-xs text-subtle">No integration required — WEBIOOM can scan this right away.</p>
          </div>

          {state?.error && <Alert tone="danger">{state.error}</Alert>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add Website'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
