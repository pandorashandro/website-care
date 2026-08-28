'use client'

import { useActionState } from 'react'
import { scanWebsite, type ScanWebsiteState } from './actions'
import Button from '@/components/ui/button'

const initialState: ScanWebsiteState = null

export default function ScanWebsiteButton({
  websiteId,
  label = 'Scan Website',
}: {
  websiteId: string
  label?: string
}) {
  const [state, formAction, pending] = useActionState(scanWebsite, initialState)

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="websiteId" value={websiteId} />

      <Button type="submit" variant="outline" disabled={pending} className="w-full">
        {pending ? 'Scanning website…' : label}
      </Button>

      {state?.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  )
}
