import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Hand,
  Layers,
  Lock,
  EyeOff,
  Target,
  ShieldCheck,
  History,
  RotateCcw,
  ShieldAlert,
  Search,
  Wrench,
  Eye,
  CheckCircle2,
  FileCheck,
  Sparkles,
} from 'lucide-react'
import Container from '@/components/ui/container'
import Section from '@/components/ui/section'
import ScrollReveal from '@/components/ui/scroll-reveal'
import Card from '@/components/ui/card'
import Alert from '@/components/ui/alert'
import { buttonStyles } from '@/components/ui/button'
import FlowDiagram from '@/components/ui/flow-diagram'

export const metadata: Metadata = {
  title: 'Security & Trust',
  description:
    "webioom's actual product safety model: scanning is separate from fixing, supported changes require your approval, credentials stay server-side, and changes are verified, recorded, and reversible where safe.",
}

const PRINCIPLES = [
  {
    icon: Layers,
    title: 'Scanning is separate from fixing',
    description: 'Scanning a website does not itself authorize webioom to edit it — the two are distinct.',
  },
  {
    icon: Hand,
    title: 'You approve supported changes',
    description: 'Current direct-fix workflows require your explicit approval before anything is applied.',
  },
  {
    icon: Lock,
    title: 'Credentials stay server-side',
    description: 'Connected credentials are handled on webioom\'s servers, not intentionally rendered into the browser.',
  },
  {
    icon: Target,
    title: 'Changes are narrowly scoped',
    description: 'A supported fix targets one specific, confirmed field or resource — never a broad, uncontrolled edit.',
  },
  {
    icon: EyeOff,
    title: 'Fresh checks before Apply',
    description: 'webioom re-checks the relevant state right before a supported write, so a stale preview is never blindly applied.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified after Apply',
    description: 'Supported workflows verify the result of a change, where verification is available.',
  },
  {
    icon: History,
    title: 'History gives visibility',
    description: 'Every successful supported write is recorded, so you can see exactly what changed.',
  },
  {
    icon: RotateCcw,
    title: 'Undo where safe',
    description: 'Supported changes can be undone when webioom can safely confirm the current target and state.',
  },
  {
    icon: ShieldAlert,
    title: 'Refuses rather than guesses',
    description: 'If webioom cannot safely confirm the target or current state, it stops instead of attempting an uncertain write.',
  },
]

const TRUST_WORKFLOW = [
  { label: 'Find', icon: Search },
  { label: 'Prepare', icon: Wrench },
  { label: 'You Review', icon: Eye },
  { label: 'Apply', icon: CheckCircle2 },
  { label: 'Verify', icon: ShieldCheck },
  { label: 'Record', icon: FileCheck },
]

const CREDENTIAL_POINTS = [
  'Handled server-side — never processed or stored in your browser session',
  'Stored encrypted at rest',
  'Never displayed back as raw credentials anywhere in the product',
  'Used only through webioom\'s own authenticated server-side workflows',
]

const AI_BOUNDARY_POINTS = [
  'Choose which website resource gets edited',
  'Choose arbitrary fields to change',
  'Decide what permissions it has',
  'Receive your connected credentials',
  'Directly execute the supported write itself',
]

const LIFECYCLE_STEPS = [
  { title: '1. Verify', description: 'webioom attempts a targeted check of the applied change, where verification is available.' },
  { title: '2. Record', description: 'A successful write is recorded in your history, so you can see exactly what changed.' },
  { title: '3. Undo', description: 'Where the change is supported and safe to reverse, you can undo it.' },
  { title: '4. Re-check', description: 'Undo itself re-checks the current state before writing anything — never a blind reversal.' },
]

export default function SecurityPage() {
  return (
    <>
      {/* 8. HERO */}
      <Section tint="muted" border="bottom" size="lg" containerClassName="text-center">
        <p className="text-sm font-semibold tracking-wide text-brand">Security &amp; Trust</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          You&apos;re always in control of changes to your website.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          webioom separates finding problems from changing your site. Supported changes follow a
          controlled workflow designed to confirm the target, require your approval, and give you
          visibility into what happened.
        </p>
      </Section>

      {/* 9. CORE TRUST PRINCIPLES */}
      <Section>
        <ScrollReveal className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((principle) => {
            const Icon = principle.icon
            return (
              <Card key={principle.title} className="motion-hover-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{principle.title}</h3>
                <p className="mt-2 text-sm text-muted">{principle.description}</p>
              </Card>
            )
          })}
        </ScrollReveal>
      </Section>

      {/* 10. TRUST WORKFLOW VISUAL */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <Card>
            <FlowDiagram steps={TRUST_WORKFLOW} />
            <p className="mt-6 text-sm text-gray-700">
              The important step is yours: nothing in the current supported direct-fix workflow is applied
              until you approve it.
            </p>
          </Card>
        </ScrollReveal>
      </Section>

      {/* 11. CREDENTIAL HANDLING */}
      <Section>
        <ScrollReveal className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">How connected credentials are handled</h2>
            <p className="mt-3 text-sm text-muted">
              When you connect a supported integration like WordPress, the credential you provide is:
            </p>
          </div>

          <Card>
            <ul className="space-y-3">
              {CREDENTIAL_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </Card>
        </ScrollReveal>
      </Section>

      {/* 12. CHANGE SAFETY — AI BOUNDARY */}
      <Section tint="muted" border="top">
        <ScrollReveal className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Why webioom doesn&apos;t just &ldquo;let AI edit the site&rdquo;</h2>
            <p className="mt-3 text-sm text-muted">
              For AI-assisted fixes, AI helps prepare the replacement text — like a title or a description
              — for you to review. That&apos;s the extent of its role. AI does not:
            </p>
          </div>

          <Card>
            <ul className="space-y-3">
              {AI_BOUNDARY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </Card>
        </ScrollReveal>
      </Section>

      {/* 13. VERIFICATION + HISTORY + UNDO LIFECYCLE */}
      <Section>
        <ScrollReveal>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">After a supported change is applied</h2>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LIFECYCLE_STEPS.map((step) => (
              <Card key={step.title} padding="sm">
                <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{step.description}</p>
              </Card>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* 14. WHAT WE DO NOT CLAIM + CTAs */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-24">
          <ScrollReveal>
            <Alert tone="info">
              webioom does not currently hold formal certifications such as SOC 2, ISO 27001, or similar,
              and has not undergone third-party security audits or penetration testing. This page describes
              the product&apos;s design principles, not a compliance or certification claim.
            </Alert>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/integrations" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
                See Integrations
              </Link>
              <Link href="/product" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
                How webioom Works
              </Link>
              <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
                Get Started
              </Link>
            </div>
          </ScrollReveal>
        </Container>
      </div>
    </>
  )
}
