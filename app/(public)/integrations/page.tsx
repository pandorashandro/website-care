import type { Metadata } from 'next'
import Link from 'next/link'
import { Plug, Puzzle, Eye, ShieldCheck, History } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Integrations',
  description:
    'Scanning your website never requires an integration. Connecting a supported integration like WordPress lets Website Care apply supported fixes directly, with your approval.',
}

const WHY_CONNECT = [
  {
    icon: Plug,
    title: 'Unlock direct fixes',
    description:
      'Supported issues on a connected site — like page titles, meta descriptions, missing headings, and missing image alt text — can be fixed directly instead of only recommended.',
  },
  {
    icon: Eye,
    title: 'Nothing changes without you',
    description:
      'Connecting an integration does not apply anything by itself. Every supported fix goes through Preview → Apply, and Apply is always something you choose to do.',
  },
  {
    icon: ShieldCheck,
    title: 'Your own authorized credentials',
    description:
      'Website Care connects using credentials you create and authorize yourself, handled on our servers — never exposed in your browser.',
  },
  {
    icon: History,
    title: 'Every change is tracked',
    description:
      'After a fix is applied, Website Care checks that it actually took effect and records it in your fix history, which you can review — and undo where safe.',
  },
]

export default function IntegrationsPage() {
  return (
    <>
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">Integrations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Scanning is universal. Fixing is unlocked by an integration.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Any website can be scanned and reported on — no integration required. Connecting a supported
            integration allows Website Care to apply supported changes directly, with your approval.
          </p>
          <div className="mt-8">
            <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              Get Started
            </Link>
          </div>
        </Container>
      </div>

      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading eyebrow="Available now" title="WordPress" />

        <Card className="mt-6 sm:flex sm:items-start sm:gap-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
            <Plug className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="mt-4 sm:mt-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">WordPress</h3>
              <Badge tone="brand">Integration #1</Badge>
              <Badge tone="success">Available</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">
              Connect a WordPress site to unlock direct fixes for supported issues — currently page titles,
              meta descriptions, missing H1 headings, and missing image alt text. Every other issue still
              gets a clear recommendation whether or not WordPress is connected.
            </p>
          </div>
        </Card>

        <div className="mt-6">
          <Card className="flex items-start gap-4 bg-surface-muted">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-muted">
              <Puzzle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">More integrations planned</h3>
              <p className="mt-1 text-sm text-muted">
                WordPress is the first integration Website Care supports, not the only one it&apos;s meant
                for. Additional platforms are on the roadmap.
              </p>
            </div>
          </Card>
        </div>
      </Container>

      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading
            eyebrow="Why connect"
            title="What connecting an integration actually does"
            description="Connecting is opt-in, and it does not change how scanning works — it only unlocks the ability to apply supported fixes."
          />

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {WHY_CONNECT.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted">{item.description}</p>
                </Card>
              )
            })}
          </div>

          <p className="mt-8 text-center text-sm text-muted">
            Curious about the details behind how this works?{' '}
            <Link href="/security" className="font-medium text-brand hover:text-brand-hover">
              Read about Website Care&apos;s trust model
            </Link>
            .
          </p>
        </Container>
      </div>
    </>
  )
}
