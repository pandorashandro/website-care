import type { ReactNode } from 'react'

/**
 * Deliberately bare — no PublicHeader/PublicFooter. This route group exists
 * solely so `/` (the pre-launch homepage) can render without the shared
 * site chrome, while every other public route keeps it unchanged via its
 * own app/(public)/layout.tsx.
 */
export default function LandingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
