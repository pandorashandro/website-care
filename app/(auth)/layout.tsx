import type { ReactNode } from 'react'

/**
 * Sprint 3, Prompt 2B (targeted correction) — deliberately bare: login,
 * signup, forgot-password, and reset-password are focused application-
 * entry experiences, not marketing pages, and must not automatically
 * inherit PublicHeader/PublicFooter (nav links, and especially the
 * marketing "scan your website for free" CTA) merely because they used to
 * share a layout with the rest of the public site. Each route's own
 * AuthShell already provides its full-screen light/dark composition,
 * including a home link back to `/`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
