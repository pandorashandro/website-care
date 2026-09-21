import type { Metadata } from 'next'
import Container from '@/components/ui/container'
import Logo from '@/components/brand/logo'

export const metadata: Metadata = {
  title: 'webioom — Where Websites Bloom.',
  description:
    'webioom is a website health and optimization platform built to help websites improve continuously. Launching soon.',
}

/**
 * Sprint 3, Prompt 2B — visual refinement pass. The pre-launch homepage
 * itself was never lost (see app/(landing)/layout.tsx's own doc comment
 * for why this separate chrome-free group exists) and stays exactly as
 * minimal as before — no new sections, no expanded scope — but the logo is
 * now given real presence (the founder's own explicit "too small"
 * feedback) with a restrained radial brand-glow behind it, and every
 * written brand reference is the correct lowercase "webioom."
 */
export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center justify-center overflow-hidden bg-brand-dark px-4 py-24 text-center sm:py-32">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: 'var(--brand-gradient)' }}
        aria-hidden="true"
      />

      <Container size="sm" className="relative flex flex-col items-center motion-safe:animate-[webioom-rise-in_600ms_var(--ease-out)_both]">
        <Logo variant="dark" className="h-14 sm:h-16" />
        <p className="mt-5 text-base font-semibold tracking-wide text-brand-vivid">Where Websites Bloom.</p>

        <p className="mt-12 text-xl font-medium text-text-on-dark">We&rsquo;re getting ready to launch.</p>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-text-on-dark-muted">
          webioom is a website health and optimization platform built to help websites improve continuously.
        </p>

        <p className="mt-12 text-xs font-semibold uppercase tracking-[0.2em] text-brand-vivid">Launching soon</p>
      </Container>
    </div>
  )
}
