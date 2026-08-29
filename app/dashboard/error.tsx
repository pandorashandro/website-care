'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Button, { buttonStyles } from '@/components/ui/button'

/**
 * Catches unexpected runtime failures anywhere under /dashboard (this page
 * and every nested route that doesn't define its own more specific
 * error.tsx). Deliberately generic and safe — `error` may contain internal
 * details (stack traces, raw messages) that must never be rendered to the
 * user, so only a fixed, safe message is shown regardless of what actually
 * threw.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Kept server-side/console only — never rendered in the UI.
    console.error(error)
  }, [error])

  return (
    <Container size="sm" className="flex flex-1 flex-col items-center justify-center py-24 text-center">
      <Card padding="md" className="max-w-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle text-red-600">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          webioom ran into an unexpected problem loading this page. Your data hasn&apos;t been affected.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={() => reset()}>
            Try Again
          </Button>
          <Link href="/dashboard" className={buttonStyles({ variant: 'outline' })}>
            Back to Dashboard
          </Link>
        </div>
      </Card>
    </Container>
  )
}
