import type { ReactNode } from 'react'
import PublicHeader from '@/components/site/public-header'
import PublicFooter from '@/components/site/public-footer'

/**
 * Shared chrome for every public (unauthenticated) route — home, login,
 * signup, and future marketing pages (Phase 18.3+). /dashboard has its own
 * separate layout and is never wrapped by this one.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <PublicFooter />
    </div>
  )
}
