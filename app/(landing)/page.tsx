import type { Metadata } from 'next'
import Container from '@/components/ui/container'
import Logo from '@/components/brand/logo'

export const metadata: Metadata = {
  title: 'Webioom — Where Websites Bloom.',
  description:
    'Webioom is a website health and optimization platform built to help websites improve continuously. Launching soon.',
}

/**
 * Sprint 3, Prompt 2 — the pre-launch homepage was never lost (Prompt 1's
 * audit incorrectly reported `/` as a 404 — its file search missed this
 * route group; see app/(landing)/layout.tsx's own doc comment for why a
 * separate chrome-free group exists at all). Fixed in place, scope
 * unchanged: the fake text wordmark ("WEBIOOM" set in a heading, which the
 * brand rules explicitly forbid — no recreating the logo with text) is
 * replaced with the actual approved logo image, and customer-facing copy
 * is corrected to the "Webioom" capitalization. No new sections, no
 * expanded scope.
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-brand-dark px-4 py-24 text-center sm:py-32">
      <Container size="sm" className="flex flex-col items-center">
        <Logo variant="dark" className="h-10 sm:h-12" />
        <p className="mt-4 text-sm font-semibold tracking-wide text-brand-vivid">Where Websites Bloom.</p>

        <p className="mt-10 text-lg text-text-on-dark-muted">We&rsquo;re getting ready to launch.</p>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-text-on-dark-muted">
          Webioom is a website health and optimization platform built to help websites improve continuously.
        </p>

        <p className="mt-10 text-sm font-semibold uppercase tracking-wide text-brand-vivid">Launching soon.</p>
      </Container>
    </div>
  )
}
