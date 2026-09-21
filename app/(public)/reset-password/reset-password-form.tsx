'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'
import { Label } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'
import Spinner from '@/components/ui/spinner'
import AuthShell from '@/components/auth/auth-shell'

type Stage = 'verifying' | 'ready' | 'invalid' | 'success'

/**
 * How long to wait for Supabase's client-side recovery session to appear
 * before concluding the link is invalid/expired/already used. Generous —
 * this only guards against a link that never establishes a session at
 * all, not normal network latency.
 */
const RECOVERY_WAIT_TIMEOUT_MS = 8000

/**
 * Clicking a password-recovery email link lands the browser back here with
 * either a session-establishing URL fragment (a valid, unused link — the
 * Supabase browser client auto-detects this and fires a PASSWORD_RECOVERY
 * auth event) or an `#error=...` fragment (an invalid, expired, or
 * already-used link — no session is ever established). Both are read from
 * `window.location.hash` / the auth event, never from a custom token
 * scheme of our own.
 */
export default function ResetPasswordForm() {
  const [stage, setStage] = useState<Stage>('verifying')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    let subscription: { unsubscribe: () => void } | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null

    async function verifyRecoveryLink() {
      // Deferred past a microtask so this effect only ever synchronizes
      // with the external Supabase auth state rather than setting state
      // synchronously during the effect's own commit.
      await Promise.resolve()
      if (cancelled) return

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      if (hashParams.get('error')) {
        setStage('invalid')
        return
      }

      const supabase = createClient()

      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY' && !cancelled) {
          setStage('ready')
        }
      })
      subscription = data.subscription

      // Fallback for the (rare) case where the recovery session was
      // already established — and its event already fired — before this
      // listener was attached.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session && !cancelled) {
        setStage((current) => (current === 'verifying' ? 'ready' : current))
      }

      timeout = setTimeout(() => {
        if (!cancelled) setStage((current) => (current === 'verifying' ? 'invalid' : current))
      }, RECOVERY_WAIT_TIMEOUT_MS)
    }

    void verifyRecoveryLink()

    return () => {
      cancelled = true
      subscription?.unsubscribe()
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    const validation = validateNewPassword(password, confirmPassword)
    if (!validation.ok) {
      setFormError(validation.message)
      return
    }

    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setFormError(error.message)
      setSubmitting(false)
      return
    }

    // The recovery session is single-purpose — sign it out so the
    // customer returns to the ordinary login flow with their new
    // password, matching the requested journey exactly.
    await supabase.auth.signOut()
    setSubmitting(false)
    setStage('success')
  }

  return (
    <AuthShell
      brandHeadline="Almost there — a fresh password, a fresh start."
      brandDescription="Once it's set, you'll be right back where you left off — your websites, reports, and settings are unchanged."
    >
      <div className="w-full max-w-sm motion-safe:animate-[webioom-rise-in_var(--duration-reveal)_var(--ease-out)_both]">
        {stage === 'verifying' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Spinner className="h-6 w-6 text-brand" />
            <p className="text-sm text-muted">Verifying your reset link…</p>
          </div>
        )}

        {stage === 'invalid' && (
          <>
            <h1 className="text-2xl font-semibold text-gray-900">This link is invalid or has expired</h1>
            <p className="mt-1 text-sm text-muted">
              Password reset links can only be used once and expire after a short time.
            </p>
            <Link href="/forgot-password" className="mt-6 block">
              <Button className="w-full">Request a new link</Button>
            </Link>
          </>
        )}

        {stage === 'ready' && (
          <>
            <h1 className="text-2xl font-semibold text-gray-900">Choose a new password</h1>
            <p className="mt-1 text-sm text-muted">Enter and confirm your new password below.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <PasswordInput
                  id="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className="mt-1"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <PasswordInput
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className="mt-1"
                  autoComplete="new-password"
                />
              </div>

              {formError && <Alert tone="danger">{formError}</Alert>}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </>
        )}

        {stage === 'success' && (
          <>
            <h1 className="text-2xl font-semibold text-gray-900">Password updated</h1>
            <Alert tone="success" className="mt-4">
              Your password has been changed. Please log in with your new password.
            </Alert>
            <Link href="/login" className="mt-6 block">
              <Button className="w-full">Go to login</Button>
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  )
}
