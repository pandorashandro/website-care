import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ScanSearch,
  BarChart3,
  Wrench,
  Eye,
  CheckCircle2,
  ShieldCheck,
  History,
  Zap,
  Sparkles,
  Compass,
  Plug,
  ScanLine,
  Hand,
  Target,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Product',
  description:
    'How Website Care actually works: scanning vs. connecting an integration, how issues become Safe, AI-Assisted, or Guided fixes, and the Review → Apply → Verify → History workflow.',
}

const LOOP_STEPS = [
  {
    icon: ScanSearch,
    title: 'Scan',
    description: 'Website Care crawls important pages across your site and checks them for supported website-health issues.',
  },
  {
    icon: BarChart3,
    title: 'Understand',
    description:
      'Results are organized using a health score, category, severity, priority, affected pages, and a plain-language recommendation for each finding.',
  },
  {
    icon: Wrench,
    title: 'Act',
    description:
      'Depending on what Website Care can safely support, an issue becomes a Safe Fix, an AI-Assisted Fix, or a Guided Fix you carry out yourself.',
  },
  {
    icon: Eye,
    title: 'Review',
    description: 'For supported direct changes, Website Care prepares a preview — showing exactly what would change — before anything is written.',
  },
  {
    icon: CheckCircle2,
    title: 'Apply',
    description: 'Nothing is written to your site until you explicitly approve the supported change.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    description: 'After a supported change is applied, Website Care checks that it actually appears correctly — not just that the request succeeded.',
  },
  {
    icon: History,
    title: 'History / Undo',
    description:
      'Supported writes are recorded so you can see exactly what changed, and can be undone when Website Care can safely confirm the target is unchanged.',
  },
]

const FIX_TYPES = [
  {
    icon: Zap,
    title: 'Safe Fix',
    description:
      'A constrained, deterministic change Website Care can prepare with confidence — the kind of edit where there is one clearly correct outcome.',
  },
  {
    icon: Sparkles,
    title: 'AI-Assisted Fix',
    description:
      'AI drafts appropriate replacement content — like a title or description — based on your page. You always review it before anything is applied.',
  },
  {
    icon: Compass,
    title: 'Guided Fix',
    description:
      'When automating a change would be unsafe, ambiguous, or depend on judgment only you can make, Website Care explains what to do instead of guessing.',
  },
]

const SUPPORTED_FIX_EXAMPLES = ['Page title', 'Meta description', 'Missing H1', 'Missing image alt text']

const SAFETY_POINTS = [
  { icon: Target, text: 'Supported fixes are narrowly scoped to the exact field they describe.' },
  { icon: Hand, text: 'A supported change is applied only after you explicitly approve it.' },
  { icon: ScanLine, text: 'Website Care re-checks the target fresh, right before applying — not from a stale snapshot.' },
  { icon: ShieldCheck, text: 'A verification pass follows every supported write.' },
  { icon: History, text: 'History gives you a record of exactly what changed, and when.' },
  { icon: RotateCcw, text: 'Where it can safely confirm nothing else has changed, a supported fix can be undone.' },
  { icon: ShieldAlert, text: 'When Website Care can’t safely confirm what it would be changing, it declines rather than guesses.' },
]

export default function ProductPage() {
  return (
    <>
      {/* 1. HERO */}
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">How it works</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            From website problems to clear next steps.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Website Care scans important pages, organizes what it finds, shows what matters most, and helps
            resolve supported issues through a controlled, reviewable workflow.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              Get Started
            </Link>
            <Link href="/website-health" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
              Explore Website Health
            </Link>
          </div>
        </Container>
      </div>

      {/* 2. CORE PRODUCT LOOP */}
      <Container size="md" className="py-16 sm:py-20">
        <SectionHeading
          eyebrow="The core loop"
          title="Seven stages, from first scan to a verified, recorded change"
          description="This is the actual workflow every supported fix goes through today — not a simplified summary."
        />

        <ol className="mt-10 list-none">
          {LOOP_STEPS.map((step, index) => {
            const Icon = step.icon
            const isLast = index === LOOP_STEPS.length - 1
            return (
              <li key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {!isLast && <span className="mt-1 w-px flex-1 bg-border-strong" aria-hidden="true" />}
                </div>
                <div className={isLast ? 'pb-1' : 'pb-8'}>
                  <h3 className="pt-1.5 text-base font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted">{step.description}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <p className="mt-2 text-sm text-subtle">Continuous monitoring between visits is planned, not available yet.</p>
      </Container>

      {/* 3. SCANNING VS INTEGRATIONS */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading eyebrow="An important distinction" title="Scanning and connecting are different" />

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="text-base font-semibold text-gray-900">Scanning</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
                <li>Works without connecting any integration or CMS</li>
                <li>Analyzes your website and builds the health report</li>
                <li>Identifies issues across all five health categories</li>
              </ul>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-gray-900">
                Integration <Badge tone="neutral">Optional</Badge>
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
                <li>Gives Website Care authorized access to a supported system</li>
                <li>Unlocks supported direct fixes for that site</li>
                <li>Does not mean anything changes automatically — approval is still required for every fix</li>
              </ul>
            </Card>
          </div>

          <p className="mt-6 text-sm text-muted">
            WordPress is currently Integration #1. Any website can be scanned and reported on with or
            without a connected integration.
          </p>

          <div className="mt-6">
            <Link href="/integrations" className={buttonStyles({ variant: 'outline' })}>
              See Integrations
            </Link>
          </div>
        </Container>
      </div>

      {/* 4. WHAT HAPPENS TO EACH ISSUE */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading
          eyebrow="Not every issue is the same"
          title="Website Care doesn't put an Apply button next to everything"
          description="Every finding is matched to the kind of action that's actually appropriate for it."
        />

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {FIX_TYPES.map((type) => {
            const Icon = type.icon
            return (
              <Card key={type.title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{type.title}</h3>
                <p className="mt-2 text-sm text-muted">{type.description}</p>
              </Card>
            )
          })}
        </div>

        {/* 5. SUPPORTED FIX EXAMPLES */}
        <Card className="mt-8 bg-surface-muted">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-brand" aria-hidden="true" />
            <h3 className="text-base font-semibold text-gray-900">Current supported fix examples</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            These four are today&apos;s concrete examples of the fix engine, not the whole picture — the
            report detects considerably more issues than Website Care can currently apply directly. As
            support grows, more issue types will move from Guided into Safe or AI-Assisted.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUPPORTED_FIX_EXAMPLES.map((example) => (
              <Badge key={example} tone="brand">
                {example}
              </Badge>
            ))}
          </div>
        </Card>
      </Container>

      {/* 6. SAFETY / CONTROL */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="md" className="py-16 sm:py-20 text-center">
          <p className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
            &ldquo;Automate what Website Care can prove. Don&apos;t guess when intent matters.&rdquo;
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            That principle shapes every supported fix, not just the ones that happen to be easy.
          </p>
        </Container>

        <Container size="lg" className="pb-16 sm:pb-20">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SAFETY_POINTS.map((point) => {
              const Icon = point.icon
              return (
                <div key={point.text} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-brand">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm text-gray-700">{point.text}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-8 text-center">
            <Link href="/security" className={buttonStyles({ variant: 'outline' })}>
              Read About Security
            </Link>
          </div>
        </Container>
      </div>
    </>
  )
}
