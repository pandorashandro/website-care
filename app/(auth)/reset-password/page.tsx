import type { Metadata } from 'next'
import ResetPasswordForm from './reset-password-form'

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your webioom account.',
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
