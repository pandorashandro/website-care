import type { Metadata } from 'next'
import Link from 'next/link'
import { ScanSearch, BarChart3, Wrench, Eye, CheckCircle2, ShieldCheck, History, Zap, Sparkles, Compass, Target, Hand, ShieldAlert } from 'lucide-react'
import Section from '@/components/ui/section'
import ScrollReveal from '@/components/ui/scroll-reveal'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import ProductPreview from '@/components/marketing/product-preview'
import FlowDiagram from '@/components/ui/flow-diagram'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Product',
  description: 'How webioom actually works: scan, prioritize, fix, verify — a controlled, reviewable workflow for improving your website.',
}

const LOOP_STEPS = [
  { icon: ScanSearch, label: 'Scan' },
  { icon: BarChart3, label: 'Understand' },
  { icon: Wrench, label: 'Act' },
  { icon: Eye, label: 'Review' },
  { icon: CheckCircle2, label: 'Apply' },
  { icon: ShieldCheck, label: 'Verify' },
  { icon: History, label: 'History' },
]

const LOOP_DETAILS = [
  { title: 'Scan & Understand', description: 'webioom crawls your site and turns every issue into a health score, severity, priority, and plain-language reason.' },
  { title: 'Act & Review', description: 'Each issue becomes a Safe Fix, an AI-Assisted Fix, or clear guidance — with a preview before anything is written.' },
  { title: 'Apply, Verify & Record', description: 'Nothing changes until you approve it. webioom then confirms the change worked, and records it for History and Undo.' },
]

const FIX_TYPES = [
  { icon: Zap, title: 'Safe Fix', description: 'A constrained, deterministic change webioom can prepare with confidence.' },
  { icon: Sparkles, title: 'AI-Assisted Fix', description: 'AI drafts replacement content — like a title — for you to review before anything is applied.' },
  { icon: Compass, title: 'Guided Fix', description: "When automating a change would be unsafe or ambiguous, webioom explains what to do instead of guessing." },
]

const SUPPORTED_FIX_EXAMPLES = ['Page title', 'Meta description', 'Missing H1', 'Missing image alt text']

const SAFETY_POINTS = [
  { icon: Target, text: 'Every supported fix is narrowly scoped to the exact field it describes.' },
  { icon: Hand, text: 'A change is applied only after you explicitly approve it.' },
  { icon: ShieldCheck, text: 'A verification pass follows every supported write.' },
  { icon: ShieldAlert, text: 'When webioom can’t safely confirm what it would be changing, it declines rather than guesses.' },
]

export default function ProductPage() {
  return (
    <>
      {/* 1. HERO — asymmetric split: message left, real product visual right */}
      <Section tint="muted" border="bottom" size="xl">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-sm font-semibold tracking-wide text-brand">How it works</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              From website problems to clear next steps.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              webioom scans your site, prioritizes what matters, and helps you resolve it through a controlled, reviewable workflow.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
                Get Started
              </Link>
              <Link href="/website-health" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
                Explore Website Health
              </Link>
            </div>
          </div>
          <ProductPreview className="mx-auto w-full max-w-md motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both]" />
        </div>
      </Section>

      {/*
        2. THE CORE LOOP — a deliberate dark gradient product moment
        (Sprint 3, Prompt 2B closed batch, Section 24: purpose = the single
        biggest visual "here is the whole product in one shape" statement
        on the page). Seven stages as one connected flow instead of a
        seven-item vertical list, with the mechanics grouped into three
        plain-language beats underneath rather than seven repeated
        paragraphs.
      */}
      <Section tint="dark">
        <ScrollReveal>
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-brand-vivid">The core loop</p>
          <h2 className="mx-auto mt-2 max-w-xl text-center text-2xl font-semibold text-text-on-dark sm:text-3xl">
            One connected workflow, start to finish
          </h2>

          <div className="mt-10 flex justify-center">
            <FlowDiagram steps={LOOP_STEPS} variant="dark" className="justify-center" />
          </div>
        </ScrollReveal>

        <ScrollReveal delayMs={100} className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {LOOP_DETAILS.map((detail) => (
            <div key={detail.title} className="rounded-lg border border-white/10 bg-white/5 p-5">
              <h3 className="text-sm font-semibold text-text-on-dark">{detail.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-on-dark-muted">{detail.description}</p>
            </div>
          ))}
        </ScrollReveal>
      </Section>

      {/* 3. SCANNING VS INTEGRATIONS */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading eyebrow="An important distinction" title="Scanning and connecting are different" />

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="text-base font-semibold text-gray-900">Scanning</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
                <li>Works without connecting any integration or CMS</li>
                <li>Builds a full health report across all seven pillars</li>
              </ul>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-gray-900">
                Integration <Badge tone="neutral">Optional</Badge>
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
                <li>Unlocks supported direct fixes for that site</li>
                <li>Never changes anything automatically — approval is still required for every fix</li>
              </ul>
            </Card>
          </div>

          <div className="mt-6">
            <Link href="/integrations" className={buttonStyles({ variant: 'outline' })}>
              See Integrations
            </Link>
          </div>
        </ScrollReveal>
      </Section>

      {/* 4. WHAT HAPPENS TO EACH ISSUE */}
      <Section>
        <ScrollReveal>
          <SectionHeading eyebrow="Not every issue is the same" title="webioom doesn't put an Apply button next to everything" />
        </ScrollReveal>

        <ScrollReveal delayMs={80} className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {FIX_TYPES.map((type) => {
            const Icon = type.icon
            return (
              <Card key={type.title} className="motion-hover-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{type.title}</h3>
                <p className="mt-2 text-sm text-muted">{type.description}</p>
              </Card>
            )
          })}
        </ScrollReveal>

        <ScrollReveal delayMs={140}>
          <Card className="mt-8 bg-surface-muted">
            <h3 className="text-base font-semibold text-gray-900">Current supported fix examples</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUPPORTED_FIX_EXAMPLES.map((example) => (
                <Badge key={example} tone="brand">
                  {example}
                </Badge>
              ))}
            </div>
          </Card>
        </ScrollReveal>
      </Section>

      {/* 5. SAFETY / CONTROL — second dark moment: the trust principle closing the page's story */}
      <Section tint="dark" border="top" size="md" containerClassName="text-center">
        <ScrollReveal>
          <p className="text-xl font-semibold tracking-tight text-text-on-dark sm:text-2xl">
            &ldquo;Automate what webioom can prove. Don&apos;t guess when intent matters.&rdquo;
          </p>
        </ScrollReveal>

        <ScrollReveal delayMs={80} className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-5 text-left sm:grid-cols-2">
          {SAFETY_POINTS.map((point) => {
            const Icon = point.icon
            return (
              <div key={point.text} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-brand-vivid">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className="text-sm text-text-on-dark-muted">{point.text}</p>
              </div>
            )
          })}
        </ScrollReveal>

        <div className="mt-10">
          <Link
            href="/security"
            className="inline-flex items-center justify-center rounded-md border border-white/20 px-6 py-3 text-base font-medium text-text-on-dark transition-colors duration-150 ease-out hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-vivid"
          >
            Read About Security
          </Link>
        </div>
      </Section>
    </>
  )
}
