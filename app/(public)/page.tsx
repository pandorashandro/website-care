import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ScanSearch,
  BarChart3,
  Lightbulb,
  Wrench,
  ShieldCheck,
  History,
  Search,
  Server,
  Accessibility,
  Gauge,
  FileText,
  Zap,
  Sparkles,
  Compass,
  Plug,
  Hand,
  Lock,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'
import ProductPreview from '@/components/marketing/product-preview'
import { RESOURCES } from '@/lib/content/resources'

export const metadata: Metadata = {
  title: 'webioom — Know what your website needs. Fix what matters.',
  description:
    'webioom scans your website, shows what needs attention across SEO, technical, accessibility, performance and content, and helps you resolve supported problems safely.',
}

const HERO_TRUST_POINTS = ['No credit card required', 'WordPress, Shopify & Wix integrations available', 'You approve every change']

const CORE_VALUE_STEPS = [
  {
    icon: ScanSearch,
    title: 'Scan deeply',
    description: 'webioom crawls your important pages and checks SEO, technical, accessibility, performance, and content.',
  },
  {
    icon: BarChart3,
    title: 'Prioritize what matters',
    description: 'Issues are ranked by severity and real-world impact — not just a raw count.',
  },
  {
    icon: Lightbulb,
    title: 'Get clear recommendations',
    description: 'Every issue includes a plain explanation of why it matters and what to do about it.',
  },
  {
    icon: Wrench,
    title: 'Fix safely',
    description: 'Supported issues can be prepared, reviewed, and applied with your approval — then verified.',
  },
  {
    icon: History,
    title: 'Keep improving',
    description: 'Rescan anytime to see what changed, with a full history and Undo where supported.',
  },
]

const HEALTH_CATEGORIES = [
  { icon: Search, name: 'SEO' },
  { icon: Server, name: 'Technical' },
  { icon: Accessibility, name: 'Accessibility' },
  { icon: Gauge, name: 'Performance' },
  { icon: FileText, name: 'Content' },
]

const TRADITIONAL_STEPS = ['Find issue', 'Tell you to fix it']

const WEBIOOM_STEPS = [
  'Find it',
  'Understand why it matters',
  'Prepare a safe fix — where supported',
  'Review before anything changes',
  'Verify, then track history',
]

const FIX_TYPES = [
  {
    icon: Zap,
    title: 'Safe Fix',
    description: 'For deterministic changes webioom can prepare safely.',
  },
  {
    icon: Sparkles,
    title: 'AI-Assisted Fix',
    description: 'AI prepares appropriate content, but you review it before anything is applied.',
  },
  {
    icon: Compass,
    title: 'Guided Fix',
    description: 'When direct automation would be unsafe or inappropriate, webioom explains what to do.',
  },
]

const SUPPORTED_FIX_EXAMPLES = ['Page titles', 'Meta descriptions', 'Missing H1 headings', 'Missing image alt text']

const TRUST_POINTS = [
  { icon: Hand, text: 'You approve every supported change before it happens.' },
  { icon: Lock, text: 'Connected credentials stay server-side, never in your browser.' },
  { icon: ShieldCheck, text: 'webioom verifies supported fixes after applying them.' },
  { icon: History, text: 'Every applied change is recorded in your fix history.' },
  { icon: RotateCcw, text: 'Supported changes can be undone where it’s safe to do so.' },
  { icon: ShieldAlert, text: 'webioom stops when it can’t safely confirm the target.' },
]

export default function Home() {
  return (
    <>
      {/* 1. HERO */}
      <div className="border-b border-border-dark bg-brand-dark">
        <Container
          size="lg"
          className="grid grid-cols-1 items-center gap-12 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28"
        >
          <div>
            <p className="text-sm font-semibold tracking-wide text-brand-vivid">Where Websites Bloom.</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-text-on-dark sm:text-5xl">
              Know what your website needs. Fix what matters.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-text-on-dark-muted">
              webioom scans your website, prioritizes what actually matters, and helps you resolve
              supported problems safely — with your review at every step.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
                Start with webioom
              </Link>
              <Link
                href="/product"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/25 px-6 py-3 text-base font-medium text-text-on-dark transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-vivid focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                See How It Works
              </Link>
            </div>

            <ul className="mt-8 flex flex-col gap-2 text-sm text-text-on-dark-muted sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
              {HERO_TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-vivid" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <ProductPreview />
        </Container>
      </div>

      {/* 2. CORE VALUE */}
      <Container size="lg" className="py-16 sm:py-24">
        <SectionHeading eyebrow="How webioom helps" title="A clear path from problem to resolution" align="center" />

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {CORE_VALUE_STEPS.map((step) => {
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
        </div>
      </Container>

      {/* 3. WHY webioom IS DIFFERENT */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-24">
          <SectionHeading
            eyebrow="Why webioom"
            title="An audit shouldn't end with a list of problems"
            align="center"
          />

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">A typical checker</h3>
              <ul className="mt-4 space-y-3">
                {TRADITIONAL_STEPS.map((step) => (
                  <li key={step} className="flex items-center gap-2 text-sm text-gray-700">
                    <Circle className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
                    {step}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="border-brand/30">
              <h3 className="text-sm font-semibold tracking-wide text-brand">webioom</h3>
              <ul className="mt-4 space-y-3">
                {WEBIOOM_STEPS.map((step) => (
                  <li key={step} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                    {step}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Container>
      </div>

      {/* 4. WEBSITE HEALTH CATEGORIES */}
      <Container size="lg" className="py-16 sm:py-24 text-center">
        <SectionHeading
          eyebrow="Website health"
          title="Five categories, not just SEO"
          description="webioom looks at what makes a website work well as a whole — not only how it ranks in search."
          align="center"
        />

        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-y-6">
          {HEALTH_CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <div key={category.name} className="flex w-1/2 items-center justify-center gap-2 px-2 sm:w-1/3 lg:w-1/5">
                <Icon className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <span className="whitespace-nowrap text-sm font-medium text-gray-800">{category.name}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-10">
          <Link href="/website-health" className={buttonStyles({ variant: 'outline' })}>
            Explore Website Health
          </Link>
        </div>
      </Container>

      {/* 5. SAFE FIXING */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-24">
          <SectionHeading
            eyebrow="Safe fixing"
            title="Not every fix works the same way"
            description="Every supported fix follows the same path: prepared, reviewed by you, applied, and verified — with a full history and Undo where it's safe."
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

          <Card className="mt-8 bg-surface">
            <h3 className="text-base font-semibold text-gray-900">webioom can already help with</h3>
            <p className="mt-1 text-sm text-muted">
              Initial supported fixes include the issues below. The full report checks well beyond these — this
              is where the fix engine starts, not where it ends.
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
      </div>

      {/* 6. INTEGRATIONS */}
      <Container size="lg" className="py-16 sm:py-24">
        <SectionHeading
          eyebrow="Integrations"
          title="Scan first. Connect only when you want fixes applied."
          description="Scanning never requires an integration. Connecting a supported integration unlocks direct fixes for supported issues — with your review at every step."
        />

        <Card className="mt-8 sm:flex sm:items-start sm:gap-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
            <Plug className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="mt-4 sm:mt-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">WordPress, Shopify &amp; Wix</h3>
              <Badge tone="success">Available</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">
              Connect a supported site to unlock selected direct fixes for that platform. Every supported
              change still goes through your review and approval before anything is applied.
            </p>
          </div>
        </Card>

        <p className="mt-4 text-sm text-subtle">More integrations planned.</p>

        <div className="mt-6">
          <Link href="/integrations" className={buttonStyles({ variant: 'outline' })}>
            See Integrations
          </Link>
        </div>
      </Container>

      {/* 7. TRUST */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-24">
          <SectionHeading eyebrow="Trust" title="webioom doesn't change your site without you" />

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST_POINTS.map((point) => {
              const Icon = point.icon
              return (
                <div key={point.text} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm text-gray-700">{point.text}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-8">
            <Link href="/security" className={buttonStyles({ variant: 'outline' })}>
              Read About Security
            </Link>
          </div>
        </Container>
      </div>

      {/* 8. RESOURCES */}
      <Container size="lg" className="py-16 sm:py-24">
        <SectionHeading eyebrow="Resources" title="Understand your website" />

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {RESOURCES.filter((resource) => resource.featured).map((resource) => (
            <Link key={resource.slug} href={`/resources/${resource.slug}`} className="group block">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <Badge tone="brand">{resource.category}</Badge>
                <h3 className="mt-3 text-base font-semibold text-gray-900">{resource.title}</h3>
                <p className="mt-2 text-sm text-muted">{resource.summary}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
                  Read more
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/resources" className={buttonStyles({ variant: 'outline' })}>
            Browse Resources
          </Link>
        </div>
      </Container>

      {/* 9. FINAL CTA */}
      <div className="border-t border-border-dark bg-brand-dark">
        <Container size="md" className="py-20 text-center sm:py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-text-on-dark sm:text-4xl">
            Give your website a clearer health check
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-text-on-dark-muted">
            Find important issues, understand what matters, and start resolving supported problems from one
            place.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              Start with webioom
            </Link>
            <Link
              href="/product"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/25 px-6 py-3 text-base font-medium text-text-on-dark transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-vivid focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              See How It Works
            </Link>
          </div>
        </Container>
      </div>
    </>
  )
}
