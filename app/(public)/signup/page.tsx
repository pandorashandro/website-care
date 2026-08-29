import type { Metadata } from 'next'
import SignupForm from './signup-form'

export const metadata: Metadata = {
  title: 'Sign up',
  description: 'Create a webioom account to scan and fix your website.',
}

export default function SignupPage() {
  return <SignupForm />
}
