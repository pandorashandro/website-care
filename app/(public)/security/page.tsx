import type { Metadata } from 'next'
import Link from 'next/link'
import { Hand, Layers, Lock, EyeOff, Target, ShieldCheck, History, RotateCcw, ShieldAlert } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Alert from '@/components/ui/alert'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Security & Trust',
  description:
    "How Website Care handles credentials and changes: you control when a fix is applied, credentials stay server-side, changes are narrowly scoped, verified, and recorded.",
}

const PRINCIPLES = [
  {
    icon: Hand,
    title: 'You control when a change happens',
    description: 'Scanning never changes anything. A supported fix is only applied when you explicitly approve it.',
  },
  {
    icon: Layers,
    title: 'Scanning and fixing are separate',
    description:
      'Website Care can report on any website without touching it. Applying a change is a distinct, opt-in step that only happens with a connected integration.',
  },
  {
    icon: Lock,
    title: 'Credentials are handled server-side',
    description:
      'Connected integration credentials are stored and used on Website Care\'s servers, not in your browser session.',
  },
  {
    icon: EyeOff,
    title: 'Never exposed to the browser',
    description: 'Connected credentials are never sent to or rendered in your browser after they\'re saved.',
  },
  {
    icon: Target,
    title: 'Narrowly scoped changes',
    description:
      'A supported fix changes exactly the field it describes — such as a page title or an image\'s alt text — and nothing else on your site.',
  },
  {
    icon: ShieldCheck,
    title: 'Changes are verified',
    description:
      'After a supported fix is applied, Website Care checks the live page to confirm the change actually appears — it doesn\'t just assume success.',
  },
  {
    icon: History,
    title: 'Fix history gives you visibility',
    description: 'Every applied fix is recorded, so you can see exactly what changed and when.',
  },
  {
    icon: RotateCcw,
    title: 'Undo where it\'s safe',
    description:
      'Where Website Care can safely confirm nothing else has changed since a fix was applied, that fix can be undone.',
  },
  {
    icon: ShieldAlert,
    title: 'Refuses when it can\'t confirm the target',
    description:
      'If Website Care cannot safely confirm exactly what it would be changing, it declines to make the change rather than guess.',
  },
]

export default function SecurityPage() {
  return (
    <>
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">Security &amp; Trust</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            How Website Care earns the right to touch your site
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            This isn&apos;t a compliance page — it&apos;s a plain-language explanation of the principles
            Website Care follows whenever it applies a change on your behalf.
          </p>
        </Container>
      </div>

      <Container size="lg" className="py-16 sm:py-20">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((principle) => {
            const Icon = principle.icon
            return (
              <Card key={principle.title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{principle.title}</h3>
                <p className="mt-2 text-sm text-muted">{principle.description}</p>
              </Card>
            )
          })}
        </div>

        <Alert tone="info" className="mt-10">
          Website Care does not currently hold formal certifications such as SOC 2 or ISO, and has not
          undergone third-party penetration testing. This page describes the product&apos;s design
          principles, not a compliance claim.
        </Alert>

        <div className="mt-10 text-center">
          <Link href="/integrations" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
            See integrations
          </Link>
        </div>
      </Container>
    </>
  )
}
