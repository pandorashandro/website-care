'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics/track'
import { Input, Label } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'
import AuthShell from '@/components/auth/auth-shell'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'

export default function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setMessage('')

    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      setSucceeded(false)
    } else {
      setMessage('Account created! Please check your email to confirm your account.')
      setSucceeded(true)
      trackEvent('sign_up', { method: 'email' })
    }

    setLoading(false)
  }

  return (
    <AuthShell
      brandHeadline="Start scanning your website in minutes."
      brandDescription="A free scan shows you a real health report — no credit card, no commitment."
    >
      <div className="w-full max-w-sm motion-safe:animate-[webioom-rise-in_var(--duration-reveal)_var(--ease-out)_both]">
        <h1 className="text-2xl font-semibold text-gray-900">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Start scanning and fixing your website in a few minutes.</p>

        <form onSubmit={handleSignup} className="mt-6 space-y-4">
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

          <div>
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              className="mt-1"
              autoComplete="new-password"
            />
          </div>

          {message && <Alert tone={succeeded ? 'success' : 'danger'}>{message}</Alert>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
            Log in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
