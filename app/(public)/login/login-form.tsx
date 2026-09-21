'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'
import Logo from '@/components/brand/logo'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setMessage('')

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden py-16">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.07] blur-3xl"
        style={{ background: 'var(--brand-gradient)' }}
        aria-hidden="true"
      />

      <Container size="sm" className="relative flex flex-col items-center motion-safe:animate-[webioom-rise-in_var(--duration-reveal)_var(--ease-out)_both]">
        <Link href="/" className="mb-10" aria-label="webioom home">
          <Logo className="h-11" />
        </Link>

        <Card padding="md" className="w-full max-w-sm shadow-md">
          <h1 className="text-2xl font-semibold text-gray-900">Log in</h1>
          <p className="mt-1 text-sm text-muted">Welcome back — enter your details to continue.</p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs font-medium text-brand hover:text-brand-hover">
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1"
              autoComplete="current-password"
            />
          </div>

          {message && <Alert tone="danger">{message}</Alert>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-brand hover:text-brand-hover">
            Sign up
          </Link>
        </p>
        </Card>
      </Container>
    </div>
  )
}
