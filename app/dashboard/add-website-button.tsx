'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { addWebsite, type AddWebsiteState } from './actions'
import Modal from '@/components/ui/modal'
import { Input, Label } from '@/components/ui/input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

const initialState: AddWebsiteState = null

export default function AddWebsiteButton() {
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
        + Add Website
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a website">
        <form ref={formRef} action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="name">Website name</Label>
            <Input id="name" name="name" type="text" required className="mt-1" placeholder="My Website" />
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
