import type { ReactNode } from 'react'
import Link from 'next/link'
import Logo from '@/components/brand/logo'

export type AuthShellProps = {
  children: ReactNode
  brandHeadline: string
  brandDescription: string
}

/**
 * Sprint 3, Prompt 2B (final continuation) — the founder's own explicit
 * example for where the light/dark visual language belongs: a focused
 * light form on one side, a premium dark webioom brand environment on the
 * other. Shared by all four auth routes (login/signup/forgot-password/
 * reset-password) so the entrance experience is one deliberate system
 * instead of four separately centered forms.
 *
 * The dark panel is presentational only — no state, no interaction beyond
 * the home link — so it collapses cleanly on mobile (`hidden lg:flex`)
 * without leaving any functionality behind; the form itself, and its own
 * (smaller, on-light) logo, is what mobile visitors see first.
 */
export default function AuthShell({ children, brandHeadline, brandDescription }: AuthShellProps) {
  return (
    <div className="flex flex-1">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-dark p-10 lg:flex xl:p-14">
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-violet) 0%, transparent 70%)' }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-16 h-[420px] w-[420px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-brand-vivid) 0%, transparent 70%)' }}
          aria-hidden="true"
        />

        <Link href="/" className="relative rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-vivid" aria-label="webioom home">
          <Logo variant="dark" className="h-10" />
        </Link>

        <div className="relative">
          <p className="text-2xl font-semibold leading-snug text-text-on-dark xl:text-3xl">{brandHeadline}</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-text-on-dark-muted">{brandDescription}</p>
        </div>

        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-brand-vivid">Where Websites Bloom.</p>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-4 py-16 lg:w-1/2">
        <Link
          href="/"
          className="mb-8 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 lg:hidden"
          aria-label="webioom home"
        >
          <Logo className="h-11" />
        </Link>
        {children}
      </div>
    </div>
  )
}
