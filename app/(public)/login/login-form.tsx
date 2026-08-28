'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

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
    <Container size="sm" className="flex flex-1 flex-col items-center justify-center py-16">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900">Log in</h1>
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
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
  )
}
