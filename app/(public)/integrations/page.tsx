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
import Container from '@/components/ui/container'
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
  { label: 'Health Report', icon: BarChart3 },
  { label: 'Supported Fix', icon: Wrench },
  { label: 'Preview', icon: Eye },
  { label: 'Approval', icon: CheckCircle2 },
  { label: 'Apply', icon: CheckCircle2 },
  { label: 'Verify', icon: ShieldCheck },
  { label: 'History / Undo', icon: History },
]

const FIX_WORKFLOW = [
  { label: 'Prepare', icon: Wrench },
  { label: 'Preview', icon: Eye },
  { label: 'Review', icon: Eye },
  { label: 'Apply', icon: CheckCircle2 },
  { label: 'Verify', icon: ShieldCheck },
  { label: 'History', icon: History },
  { label: 'Undo where safe', icon: History },
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
  'The current configuration isn’t supported',
]

export default function IntegrationsPage() {
  return (
    <>
      {/* 1. HERO */}
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">Integrations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Scan your website. Connect when you want help applying supported fixes.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
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
        </Container>
      </div>

      {/* 2. SCAN WITHOUT CONNECTING */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading eyebrow="Two paths" title="Scanning and connecting lead to different outcomes" />

        <div className="mt-10 space-y-8">
          <Card>
            <Badge tone="neutral">Without integration</Badge>
            <FlowDiagram steps={WITHOUT_INTEGRATION} className="mt-4" />
          </Card>

          <Card>
            <Badge tone="brand">With supported integration</Badge>
            <FlowDiagram steps={WITH_INTEGRATION} className="mt-4" />
          </Card>
        </div>

        <p className="mt-6 text-sm text-muted">
          Not every finding becomes a direct fix — this shows the path a <em>supported</em> issue can take
          once an integration is connected, not a guarantee for every report finding.
        </p>
      </Container>

      {/* 3. WORDPRESS — AVAILABLE */}
      <div className="border-t border-border bg-surface-muted">
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
                webioom can prepare and apply supported changes when it can safely confirm the target.
                Support depends on the specific page, resource, and configuration involved.
              </p>

              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                <li>Page title</li>
                <li>Meta description, where a supported SEO provider/configuration is detected</li>
                <li>Missing H1, where webioom can safely confirm the editable source</li>
                <li>Missing image alt text, where webioom can safely confirm the image and its source</li>
              </ul>

              <p className="mt-4 text-sm text-muted">
                Every other report finding still gets a clear recommendation, whether or not WordPress is
                connected.
              </p>
            </div>
          </Card>
        </Container>
      </div>

      {/* 3B. SHOPIFY — AVAILABLE */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading eyebrow="Available now" title="Shopify" />

        <Card className="mt-6 sm:flex sm:items-start sm:gap-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
            <Store className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="mt-4 sm:mt-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">Shopify</h3>
              <Badge tone="brand">Integration #2</Badge>
              <Badge tone="success">Available</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">
              webioom can prepare and apply supported changes when it can safely confirm the target.
              Support depends on the specific resource and permissions involved.
            </p>

            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li>Product, collection, page, and article title</li>
              <li>Product, collection, page, and article meta description</li>
            </ul>

            <p className="mt-4 text-sm text-muted">
              Every other report finding still gets a clear recommendation, whether or not Shopify is
              connected.
            </p>
          </div>
        </Card>
      </Container>

      {/* 3C. WIX — AVAILABLE */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading eyebrow="Available now" title="Wix" />

          <Card className="mt-6 sm:flex sm:items-start sm:gap-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
              <Globe className="h-6 w-6" aria-hidden="true" />
            </div>

            <div className="mt-4 sm:mt-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900">Wix</h3>
                <Badge tone="brand">Integration #3</Badge>
                <Badge tone="success">Available</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                webioom can prepare and apply supported changes when it can safely confirm the target.
                Support depends on the specific resource and permissions involved.
              </p>

              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                <li>Blog post title and meta description</li>
                <li>Store product title and meta description</li>
              </ul>

              <p className="mt-4 text-sm text-muted">
                Every other report finding still gets a clear recommendation, whether or not Wix is
                connected.
              </p>
            </div>
          </Card>
        </Container>
      </div>

      {/* 4. WHAT CONNECTING DOES / DOESN'T DO */}
      <Container size="lg" className="py-16 sm:py-20">
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
      </Container>

      {/* 5. WORDPRESS FIX WORKFLOW */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading eyebrow="How a supported fix happens" title="The controlled workflow" />

          <Card className="mt-8">
            <FlowDiagram steps={FIX_WORKFLOW} />
          </Card>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Prepare & Preview', description: 'webioom checks the target and prepares exactly what would change.' },
              { title: 'Review & Apply', description: 'You see the proposed change and choose whether to apply it.' },
              { title: 'Verify', description: 'webioom checks that the applied change actually appears correctly.' },
              { title: 'History & Undo', description: 'The change is recorded, and can be undone where it’s safe to do so.' },
            ].map((item) => (
              <Card key={item.title} padding="sm">
                <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{item.description}</p>
              </Card>
            ))}
          </div>
        </Container>
      </div>

      {/* 6. WHEN WEBSITE CARE STOPS */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading eyebrow="Conservative by design" title="If webioom can't safely confirm the change, it doesn't guess" />

        <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-gray-700">
              webioom may decline to make a direct change rather than risk an incorrect one. This is a
              deliberate safeguard, not something to hide.
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
      </Container>

      {/* 7. FUTURE INTEGRATIONS */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="md" className="py-16 sm:py-20">
          <Card className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted">
              <Puzzle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">More integrations are planned</h3>
              <p className="mt-1 text-sm text-muted">
                webioom&apos;s scanning and reporting layer isn&apos;t tied to WordPress, and the
                integration system is intended to expand over time.
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
        </Container>
      </div>
    </>
  )
}
