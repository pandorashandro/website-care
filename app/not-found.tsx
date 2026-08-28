import Link from 'next/link'
import Logo from '@/components/brand/logo'
import { buttonStyles } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      </div>
      <Link href="/" className={buttonStyles({ variant: 'primary' })}>
        Back to Home
      </Link>
    </div>
  )
}
