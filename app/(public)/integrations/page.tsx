import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Globe2,
  ScanSearch,
  BarChart3,
  ClipboardList,
  Wrench,
  Eye,
  CheckCircle2,
  ShieldCheck,
  History,
  Plug,
  Store,
  Globe,
  Puzzle,
  ShieldAlert,
} from 'lucide-react'
import Section from '@/components/ui/section'
import ScrollReveal from '@/components/ui/scroll-reveal'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'
import FlowDiagram from '@/components/ui/flow-diagram'

export const metadata: Metadata = {
  title: 'Integrations',
  description:
    'webioom scans your website without any integration. Connecting a supported integration — WordPress, Shopify, or Wix — unlocks selected direct fixes, applied only after your review and approval.',
}

const WITHOUT_INTEGRATION = [
  { label: 'Website', icon: Globe2 },
  { label: 'Scan', icon: ScanSearch },
  { label: 'Health Report', icon: BarChart3 },
  { label: 'Recommendations', icon: ClipboardList },
]

const WITH_INTEGRATION = [
  { label: 'Website', icon: Globe2 },
  { label: 'Scan', icon: ScanSearch },
  { label: 'Diagnosis', icon: BarChart3 },
  { label: 'Permission', icon: Plug },
  { label: 'Prepare', icon: Wrench, emphasize: true },
  { label: 'Verify', icon: ShieldCheck },
  { label: 'History', icon: History },
]

const FIX_WORKFLOW = [
  { label: 'Prepare', icon: Wrench },
  { label: 'Preview', icon: Eye, emphasize: true },
  { label: 'Apply', icon: CheckCircle2 },
  { label: 'Verify', icon: ShieldCheck },
  { label: 'History / Undo', icon: History },
]

const PLATFORMS = [
  {
    key: 'wordpress',
    name: 'WordPress',
    icon: Plug,
    fixes: ['Page title', 'Meta description', 'Missing H1', 'Missing image alt text'],
  },
  {
    key: 'shopify',
    name: 'Shopify',
    icon: Store,
    fixes: ['Product, collection, page, and article title', 'Product, collection, page, and article meta description'],
  },
  {
    key: 'wix',
    name: 'Wix',
    icon: Globe,
    fixes: ['Blog post title and meta description', 'Store product title and meta description'],
  },
]

const CONNECTING_DOES = [
  'Authorizes webioom to access supported resources on that site',
  'Unlocks supported direct-fix workflows for that site',
  'Allows a fresh check right before any supported write',
  'Enables verification and history for supported changes',
]

const CONNECTING_DOES_NOT = [
  'Give webioom permission to change anything whenever it wants',
  'Turn every report finding into an automatic fix',
  'Bypass your approval for any current supported workflow',
  'Guarantee every theme, plugin, or page-builder configuration is writable',
]

const STOP_REASONS = [
  'The exact target can’t be confirmed',
  'The page’s content source is ambiguous',
  'The required permission isn’t available',
  'The website changed after the preview was prepared',
]

export default function IntegrationsPage() {
  return (
    <>
      {/* HERO */}
      <Section tint="muted" border="bottom" size="lg" containerClassName="text-center">
        <p className="text-sm font-semibold tracking-wide text-brand">Integrations</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Scan your website. Connect when you want help applying supported fixes.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          webioom can scan and report on your site without a CMS integration. Connecting a supported
          platform allows webioom to apply supported changes — only after your review and approval.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
            Get Started
          </Link>
          <Link href="/product" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
            How webioom Works
          </Link>
        </div>
      </Section>

      {/*
        THE ARCHITECTURE — dark gradient flow (Sprint 3, Prompt 2B closed
        batch, Section 24: purpose = show, don't just describe, how the two
        paths genuinely diverge). Website → Intelligence → Diagnosis is
        identical either way; "Permission" is the fork, and only the
        connected path continues into Prepare/Verify/History.
      */}
      <Section tint="dark">
        <ScrollReveal>
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-brand-vivid">Two paths</p>
          <h2 className="mx-auto mt-2 max-w-xl text-center text-2xl font-semibold text-text-on-dark sm:text-3xl">
            Scanning and connecting lead to different outcomes
          </h2>

          <div className="mt-10 space-y-6">
            <div className="rounded-lg border border-white/10 bg-white/5 p-5">
              <Badge tone="neutral">Without integration</Badge>
              <FlowDiagram steps={WITHOUT_INTEGRATION} variant="dark" className="mt-4" />
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-5">
              <Badge tone="brand">With supported integration</Badge>
              <FlowDiagram steps={WITH_INTEGRATION} variant="dark" className="mt-4" />
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-center text-sm text-text-on-dark-muted">
            Not every finding becomes a direct fix — this is the path a <em>supported</em> issue can take once connected.
          </p>
        </ScrollReveal>
      </Section>

      {/* PLATFORMS — consolidated from four separate full-width sections into one grid */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading eyebrow="Available now" title="Three supported platforms" />

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon
              return (
                <Card key={platform.key}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{platform.name}</h3>
                      <Badge tone="success">Available</Badge>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-gray-700">
                    {platform.fixes.map((fix) => (
                      <li key={fix}>{fix}</li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>

          <Card className="mt-5 sm:flex sm:items-start sm:gap-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
              <Puzzle className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm text-muted sm:mt-0">
              <span className="font-medium text-gray-900">Custom or other platform: </span>
              any website can be scanned and reported on with no integration at all. Direct fixes are WordPress,
              Shopify, and Wix only today — every other platform still gets the full health report.
            </p>
          </Card>

          <p className="mt-6 text-sm text-muted">
            Every other report finding still gets a clear recommendation, whether or not a supported platform is connected.
          </p>
        </ScrollReveal>
      </Section>

      {/* WHAT CONNECTING DOES / DOESN'T DO */}
      <Section>
        <ScrollReveal>
          <SectionHeading eyebrow="Set the record straight" title="What connecting does — and doesn't do" />

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="text-base font-semibold text-gray-900">Connecting does</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
                {CONNECTING_DOES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-gray-900">Connecting does not</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
                {CONNECTING_DOES_NOT.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          </div>
        </ScrollReveal>
      </Section>

      {/* THE CONTROLLED FIX WORKFLOW — second dark moment */}
      <Section tint="dark" border="top">
        <ScrollReveal>
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-brand-vivid">How a supported fix happens</p>
          <h2 className="mx-auto mt-2 max-w-xl text-center text-2xl font-semibold text-text-on-dark sm:text-3xl">The controlled workflow</h2>

          <div className="mt-10 flex justify-center">
            <FlowDiagram steps={FIX_WORKFLOW} variant="dark" className="justify-center" />
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Prepare & Preview', description: 'webioom checks the target and prepares exactly what would change.' },
              { title: 'You Approve', description: 'You see the proposed change and choose whether to apply it.' },
              { title: 'Verify', description: 'webioom checks the applied change actually appears correctly.' },
              { title: 'History & Undo', description: 'The change is recorded, and can be undone where it’s safe to do so.' },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-text-on-dark">{item.title}</h3>
                <p className="mt-1.5 text-sm text-text-on-dark-muted">{item.description}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* WHEN WEBIOOM STOPS */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading eyebrow="Conservative by design" title="If webioom can't safely confirm the change, it doesn't guess" />

          <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-gray-700">
                webioom may decline to make a direct change rather than risk an incorrect one — a deliberate safeguard.
              </p>
            </div>

            <Card padding="sm">
              <p className="text-xs font-medium tracking-wide text-subtle">webioom may refuse a direct change when:</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {STOP_REASONS.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </Card>
          </div>
        </ScrollReveal>
      </Section>

      {/* FUTURE INTEGRATIONS */}
      <Section size="md">
        <ScrollReveal>
          <Card className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted">
              <Puzzle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">More integrations are planned</h3>
              <p className="mt-1 text-sm text-muted">
                webioom&apos;s scanning and reporting layer isn&apos;t tied to WordPress, and the integration
                system is intended to expand over time.
              </p>
            </div>
          </Card>

          <p className="mt-8 text-center text-sm text-muted">
            Want the details behind how a connected fix is kept safe?{' '}
            <Link href="/security" className="font-medium text-brand hover:text-brand-hover">
              Read about webioom&apos;s trust model
            </Link>
            .
          </p>
        </ScrollReveal>
      </Section>
    </>
  )
}
