import type { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your Website Care account.',
}

export default function LoginPage() {
  return <LoginForm />
}
