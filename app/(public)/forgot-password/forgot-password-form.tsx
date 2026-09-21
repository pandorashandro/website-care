'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Input, Label } from '@/components/ui/input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'
import AuthShell from '@/components/auth/auth-shell'

/**
 * Deliberately the ONE outcome shown for a submitted request, regardless of
 * whether the email belongs to a webioom account or what (if anything)
 * Supabase's own API returns for it — this is what "never reveal whether
 * an email exists" means in practice: no branch in this component's UI is
 * ever conditioned on account existence. Supabase's own
 * resetPasswordForEmail already does not error for an unknown email; a
 * genuine unexpected failure (network/outage) is handled separately below
 * without exposing anything about the address itself.
 */
const NEUTRAL_MESSAGE = "If an account exists for that email, we've sent a link to reset your password."
const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong sending that email. Please try again in a moment.'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [unexpectedError, setUnexpectedError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setUnexpectedError('')

    try {
      const supabase = createClient()
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setSubmitted(true)
    } catch {
      // A genuine client/network failure — never tied to whether the
      // email is registered, so safe to surface without weakening the
      // neutral-response guarantee above.
      setUnexpectedError(UNEXPECTED_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      brandHeadline="Locked out happens. Getting back in shouldn't be hard."
      brandDescription="We'll email you a secure link to choose a new password — your reports and settings stay exactly as you left them."
    >
      <div className="w-full max-w-sm motion-safe:animate-[webioom-rise-in_var(--duration-reveal)_var(--ease-out)_both]">
        <h1 className="text-2xl font-semibold text-gray-900">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {submitted ? (
          <Alert tone="success" className="mt-6">
            {NEUTRAL_MESSAGE}
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-1"
                autoComplete="email"
              />
            </div>

            {unexpectedError && <Alert tone="danger">{unexpectedError}</Alert>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
            Back to log in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
