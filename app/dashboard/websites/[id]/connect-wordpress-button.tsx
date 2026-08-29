'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { connectWordPress, type ConnectWordPressState } from './wordpress-actions'
import Modal from '@/components/ui/modal'
import { Input, Label } from '@/components/ui/input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

const initialState: ConnectWordPressState = null

export default function ConnectWordPressButton({ websiteId }: { websiteId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(connectWordPress, initialState)
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
        Connect WordPress
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Connect WordPress"
        description="Use a WordPress Application Password — not your normal account password."
      >
        <form ref={formRef} action={formAction} className="space-y-4">
          <input type="hidden" name="websiteId" value={websiteId} />

          <div>
            <Label htmlFor="username">WordPress username</Label>
            <Input id="username" name="username" type="text" autoComplete="off" required className="mt-1" />
          </div>

          <div>
            <Label htmlFor="applicationPassword">Application Password</Label>
            <Input
              id="applicationPassword"
              name="applicationPassword"
              type="password"
              autoComplete="off"
              required
              className="mt-1"
            />
          </div>

          <details className="rounded-md border border-border bg-surface-muted p-3">
            <summary className="cursor-pointer text-xs font-medium text-gray-700 marker:content-none">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true">›</span>
                What&apos;s an Application Password?
              </span>
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              It&apos;s a password WordPress generates specifically for tools like webioom, separate
              from your login password and easy to revoke on its own. In your WordPress admin, go to{' '}
              <span className="font-medium text-gray-700">Users → Profile → Application Passwords</span> to
              create one.{' '}
              <a
                href="https://wordpress.org/documentation/article/application-passwords/"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand hover:text-brand-hover"
              >
                WordPress.org documentation
              </a>
              .
            </p>
          </details>

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
