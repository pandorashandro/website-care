import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ScanSearch,
  BarChart3,
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

const WORKFLOW_STEPS = [
  {
    icon: ScanSearch,
    title: 'Scan',
    description: 'webioom checks important pages across your website.',
  },
  {
    icon: BarChart3,
    title: 'Understand',
    description: 'Issues are organized by priority, severity, and affected pages.',
  },
  {
    icon: Wrench,
    title: 'Fix',
    description: 'Supported issues can have safe or AI-assisted fixes prepared for review.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    description: 'webioom checks supported fixes after they are applied.',
  },
  {
    icon: History,
    title: 'History',
    description: 'See what changed, and safely undo supported fixes when possible.',
  },
]

const HEALTH_CATEGORIES = [
  { icon: Search, name: 'SEO', description: 'Titles, meta descriptions, headings, canonical tags, and sitemaps.' },
  { icon: Server, name: 'Technical', description: 'Reachability, HTTPS, redirects, server errors, and status codes.' },
  { icon: Accessibility, name: 'Accessibility', description: 'Image alt text, language attributes, and readable links.' },
  { icon: Gauge, name: 'Performance', description: 'Response speed and unnecessary page weight.' },
  { icon: FileText, name: 'Content', description: 'Whether a page offers enough for visitors to understand it.' },
]

const TRADITIONAL_STEPS = ['Find issue', 'Tell you to fix it']

const WEBSITE_CARE_STEPS = [
  'Find issue',
  'Explain priority',
  'Show affected pages',
  'Recommend what to do',
  'Prepare a supported fix',
  'You review it',
  'Apply',
  'Verify',
  'History / Undo',
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
      {/* 2. HERO */}
      <div className="border-b border-border-dark bg-brand-dark">
        <Container size="lg" className="py-20 text-center sm:py-28">
          <p className="text-sm font-semibold tracking-wide text-brand-vivid">Where Websites Bloom.</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-text-on-dark sm:text-5xl">
            Know what your website needs. Fix what matters.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-text-on-dark-muted">
            webioom scans your website, shows what needs attention, prioritizes the issues, and helps
            you resolve supported problems safely.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              Get Started
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

      {/* 3. PRODUCT VISUALIZATION */}
      <Container size="lg" className="py-16 sm:py-20">
        <ProductPreview />
      </Container>

      {/* 4. FROM PROBLEM TO RESOLUTION */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading
            eyebrow="How it works"
            title="From problem to resolution"
            align="center"
          />

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {WORKFLOW_STEPS.map((step) => {
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

          <p className="mt-6 text-center text-sm text-subtle">Continuous monitoring is coming later.</p>
        </Container>
      </div>

      {/* 5. WEBSITE HEALTH CATEGORIES */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading
          eyebrow="Website health"
          title="Five categories, not just SEO"
          description="webioom looks at what makes a website work well as a whole — not only how it ranks in search."
        />

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HEALTH_CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <Card key={category.name}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{category.name}</h3>
                <p className="mt-2 text-sm text-muted">{category.description}</p>
              </Card>
            )
          })}
        </div>

        <div className="mt-8 text-center">
          <Link href="/website-health" className={buttonStyles({ variant: 'outline' })}>
            Explore Website Health
          </Link>
        </div>
      </Container>

      {/* 6. DIFFERENTIATION */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
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
                {WEBSITE_CARE_STEPS.map((step) => (
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

      {/* 7. FIX TYPES / ACTIONABILITY */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading eyebrow="Actionability" title="Not every fix works the same way" />

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

        {/* 8. CURRENT SUPPORTED FIX EXAMPLES */}
        <Card className="mt-8 bg-surface-muted">
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

      {/* 9. INTEGRATIONS */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
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
                <h3 className="text-lg font-semibold text-gray-900">WordPress</h3>
                <Badge tone="success">Available</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                Connect a WordPress site to unlock supported direct fixes. Every supported change still goes
                through your review and approval before anything is applied.
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
      </div>

      {/* 10. TRUST */}
      <Container size="lg" className="py-16 sm:py-20">
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

      {/* 11. RESOURCES */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
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
      </div>

      {/* 12. FINAL CTA */}
      <Container size="md" className="py-20 text-center sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Give your website a clearer health check
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Find important issues, understand what matters, and start resolving supported problems from one
          place.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
            Get Started
          </Link>
          <Link href="/product" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
            See How It Works
          </Link>
        </div>
      </Container>
    </>
  )
}
