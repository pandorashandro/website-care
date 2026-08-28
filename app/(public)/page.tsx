import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Container from '@/components/ui/container'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Website Care — Scan, understand, and fix your website',
  description:
    'Scan your website, understand what needs attention, and fix supported issues safely — with WordPress and more integrations on the way.',
}

const EXPLORE_LINKS = [
  { label: 'Product', href: '/product', description: 'How Website Care works, end to end.' },
  { label: 'Website Health', href: '/website-health', description: 'What a health report actually checks.' },
  { label: 'Integrations', href: '/integrations', description: 'How connecting WordPress unlocks fixes.' },
  { label: 'Resources', href: '/resources', description: 'Plain-language explanations of common issues.' },
  { label: 'Security', href: '/security', description: 'How Website Care earns the right to make changes.' },
]

/**
 * Intentionally minimal shell for now — Phase 18.4 builds the full
 * marketing homepage (product narrative, screenshots, social proof, etc.).
 * This just needs to no longer look like an unstyled Next.js placeholder
 * and to point naturally to the new public pages.
 */
export default function Home() {
  return (
    <>
      <Container size="md" className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">Website Care</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Scan your website, understand what&apos;s holding it back, and fix the issues that matter — with
          WordPress and more integrations on the way.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
            Get Started
          </Link>
          <Link href="/login" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
            Log in
          </Link>
        </div>
      </Container>

      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-14">
          <h2 className="text-center text-sm font-semibold tracking-wide text-muted">Explore Website Care</h2>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {EXPLORE_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md"
              >
                <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                  {item.label}
                  <ArrowRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="mt-1 block text-xs text-muted">{item.description}</span>
              </Link>
            ))}
          </div>
        </Container>
      </div>
    </>
  )
}
