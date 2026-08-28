import type { Metadata } from 'next'
import Link from 'next/link'
import { ScanSearch, BarChart3, Wrench, ShieldCheck, History } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Product',
  description:
    'How Website Care works: scan your website, understand what needs attention, fix supported issues, verify the change, and keep a history you can undo.',
}

const STEPS = [
  {
    icon: ScanSearch,
    title: '1. Scan',
    description:
      'Website Care checks important pages across your site, following internal links to build a picture of the site as a whole — not just a single URL.',
  },
  {
    icon: BarChart3,
    title: '2. Understand',
    description:
      'Results are organized by health category, severity, and priority, with the specific pages each issue affects — so you can see what matters most, not just a wall of raw data.',
  },
  {
    icon: Wrench,
    title: '3. Fix',
    description:
      'For supported issues, Website Care prepares a safe or AI-assisted fix for you to review. Everything else comes with a clear, specific recommendation you (or your developer) can act on.',
  },
  {
    icon: ShieldCheck,
    title: '4. Verify',
    description:
      'After you approve a supported fix, Website Care checks the live page to confirm the change actually took effect — not just that the request succeeded.',
  },
  {
    icon: History,
    title: '5. History & Undo',
    description:
      'Supported fixes are recorded, so you can see exactly what changed and when — and where safely possible, undo a change with one click.',
  },
]

export default function ProductPage() {
  return (
    <>
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">What Website Care does</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Find what&apos;s wrong with your website — and fix what you can, safely.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Website Care scans your site, explains its findings in plain language, and — for supported
            issues — prepares fixes you approve before anything changes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              Get Started
            </Link>
            <Link href="/website-health" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
              See what we check
            </Link>
          </div>
        </Container>
      </div>

      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading
          eyebrow="How it works"
          title="Five steps, from first scan to a verified fix"
          description="Every step below reflects what Website Care actually does today — not a future roadmap."
        />

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <Card key={step.title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.description}</p>
              </Card>
            )
          })}

          <Card className="flex flex-col justify-center bg-surface-muted">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">Continuous monitoring</h3>
              <Badge tone="neutral">Coming later</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">
              Ongoing, automatic re-checks between visits are part of where Website Care is headed — not
              something it does today. Right now, health reflects your most recent scan.
            </p>
          </Card>
        </div>
      </Container>

      <div className="border-t border-border bg-surface-muted">
        <Container size="md" className="py-16 text-center sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            See what Website Care finds on your site
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Create an account and run your first scan — no integration required to see your results.
          </p>
          <div className="mt-6">
            <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              Get Started
            </Link>
          </div>
        </Container>
      </div>
    </>
  )
}
