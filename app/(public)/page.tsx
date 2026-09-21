import type { Metadata } from 'next'
import Link from 'next/link'
import { ScanSearch, ListChecks, Wrench, ShieldCheck, Target, Hand, ArrowRight } from 'lucide-react'
import Section from '@/components/ui/section'
import ScrollReveal from '@/components/ui/scroll-reveal'
import SectionHeading from '@/components/ui/section-heading'
import FlowDiagram from '@/components/ui/flow-diagram'
import ProductPreview from '@/components/marketing/product-preview'
import BloomScore from '@/components/marketing/bloom-score'
import { buttonStyles } from '@/components/ui/button'
import { PILLAR_IDENTITY, type PillarKey } from '@/components/website/pillar-identity'
import { PLAN_PRESENTATION, PLAN_ORDER } from '@/lib/billing/plan-presentation'
import { cn } from '@/lib/ui/cn'

export const metadata: Metadata = {
  title: 'webioom — Where Websites Bloom.',
  description:
    "webioom scans your website, scores seven real pillars of health, and shows you exactly what to fix next — then verifies the fix actually worked.",
}

/**
 * The real marketing homepage. Previously "/" rendered a deliberate one-
 * screen pre-launch placeholder (see git history) — now that /product,
 * /website-health, /integrations, /pricing, /resources, and /security are
 * all real, finished pages, "/" becomes the front door that introduces the
 * product and routes into them, rather than repeating what they already
 * explain in depth. Each section below has its own composition (no
 * repeated card-grid pattern) and the page keeps a deliberate light/dark
 * rhythm: dark hero → light → muted → dark → light → muted → the shared
 * light PreFooterCta → dark footer (both rendered by app/(public)/layout.tsx).
 */

const PILLAR_TEASER: { key: PillarKey; name: string }[] = [
  { key: 'technical-seo', name: 'Technical SEO' },
  { key: 'on-page-seo', name: 'On-Page SEO' },
  { key: 'content', name: 'Content' },
  { key: 'site-architecture', name: 'Site Architecture' },
  { key: 'performance', name: 'Performance' },
  { key: 'accessibility', name: 'Accessibility' },
  { key: 'security', name: 'Security' },
]

const LOOP_STEPS = [
  { icon: ScanSearch, label: 'Scan' },
  { icon: ListChecks, label: 'Prioritize' },
  { icon: Wrench, label: 'Fix' },
  { icon: ShieldCheck, label: 'Verify' },
]

const TRUST_POINTS = [
  { icon: Target, text: 'Every supported fix is narrowly scoped — never a blanket rewrite of your site.' },
  { icon: Hand, text: 'Nothing is applied until you explicitly approve it.' },
  { icon: ShieldCheck, text: 'A verification pass follows every fix, so you know it actually worked.' },
]

const CHAOS_LABELS = ['Slow pages?', 'Broken link?', 'Missing tag?', 'Duplicate title?', 'Thin content?', 'No alt text?']

export default function Home() {
  return (
    <>
      {/* 1. HERO — the signature visual: a growing health score, built from seven pillars, made literal. Pure CSS entrance (no IntersectionObserver) since this is above the fold and must never depend on a scroll event to appear. */}
      <Section tint="dark" size="xl">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <div className="text-center motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both] lg:text-left">
            <p className="text-sm font-semibold tracking-wide text-brand-vivid">Website health intelligence</p>
            <h1 className="mx-auto mt-4 max-w-xl text-4xl font-semibold tracking-tight text-text-on-dark sm:text-5xl lg:mx-0">
              Your website has a health score. Now you can watch it grow.
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-text-on-dark-muted lg:mx-0">
              webioom scans every page, scores seven real pillars of health, and shows you exactly what to fix next —
              then verifies the fix actually worked.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link href="/signup" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
                Scan your website for free
              </Link>
              <Link
                href="/product"
                className={buttonStyles({ variant: 'outline', size: 'lg', className: 'border-white/15 bg-white/5 text-text-on-dark hover:bg-white/10' })}
              >
                See how it works
              </Link>
            </div>
          </div>

          <div
            className="flex flex-col items-center motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both]"
            style={{ animationDelay: '160ms' }}
          >
            <BloomScore />
            <p className="mt-2 text-xs text-text-on-dark-muted/70">Illustrative example — not a live scan.</p>
          </div>
        </div>
      </Section>

      {/* 2. FROM NOISE TO CLARITY — real product UI (ProductPreview) doing the explaining instead of another paragraph. */}
      <Section border="bottom">
        <ScrollReveal>
          <SectionHeading
            eyebrow="From noise to clarity"
            title="Stop guessing what's actually wrong."
            description="Most site owners have a vague sense something's off. webioom replaces that guesswork with one prioritized, evidence-backed list."
          />
        </ScrollReveal>

        <ScrollReveal delayMs={100} className="relative mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="relative">
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-muted/60 p-8">
              {CHAOS_LABELS.map((label, index) => (
                <span
                  key={label}
                  className={cn(
                    'rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-subtle shadow-sm',
                    index % 3 === 0 && 'rotate-2',
                    index % 3 === 1 && '-rotate-2',
                    index % 3 === 2 && 'rotate-1'
                  )}
                >
                  {label}
                </span>
              ))}
            </div>
            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background px-3 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              Before
            </span>
          </div>

          <div
            className="pointer-events-none absolute left-1/2 top-1/2 hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface shadow-md lg:flex"
            aria-hidden="true"
          >
            <ArrowRight className="h-4 w-4 text-brand" />
          </div>

          <div className="relative">
            <ProductPreview className="mx-auto w-full max-w-sm" />
            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background px-3 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              After
            </span>
          </div>
        </ScrollReveal>
      </Section>

      {/* 3. SEVEN PILLARS TEASER — the score's own receipts, at a glance. Depth lives on /website-health; this is a taste, not a repeat. */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading
            eyebrow="Seven real pillars"
            title="One score. Nothing hand-waved."
            description="Every Website Health score is built from seven pillars you can actually inspect — not a black-box number."
            align="center"
          />
        </ScrollReveal>

        <ScrollReveal delayMs={100} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {PILLAR_TEASER.map((pillar) => {
            const identity = PILLAR_IDENTITY[pillar.key]
            const Icon = identity.icon
            return (
              <span
                key={pillar.key}
                className="inline-flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-sm font-medium text-gray-700 shadow-sm"
                style={{ borderColor: identity.accentSubtleBg }}
              >
                <Icon className="h-4 w-4" style={{ color: identity.accent }} aria-hidden="true" />
                {pillar.name}
              </span>
            )
          })}
        </ScrollReveal>

        <ScrollReveal delayMs={160} className="mt-8 text-center">
          <Link href="/website-health" className="text-sm font-medium text-brand hover:text-brand-hover">
            See how scoring works →
          </Link>
        </ScrollReveal>
      </Section>

      {/* 4. THE WORKFLOW — second dark moment, the page's own "here is the whole product in one shape" statement. Distinct from /product's own 7-step operational diagram: this is the higher-level story a first-time visitor needs. */}
      <Section tint="dark" border="top">
        <ScrollReveal>
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-brand-vivid">The workflow</p>
          <h2 className="mx-auto mt-2 max-w-xl text-center text-2xl font-semibold text-text-on-dark sm:text-3xl">
            One controlled loop, not a black box
          </h2>

          <div className="mt-10 flex justify-center">
            <FlowDiagram steps={LOOP_STEPS} variant="dark" className="justify-center" />
          </div>

          <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-text-on-dark-muted">
            Every fix is reviewed before it&apos;s applied, and verified after — so nothing changes on your website
            without your say, and you always know it actually worked.
          </p>

          <div className="mt-8 flex justify-center">
            <Link href="/product" className="text-sm font-medium text-brand-vivid hover:text-text-on-dark">
              See the full product loop →
            </Link>
          </div>
        </ScrollReveal>
      </Section>

      {/* 5. TRUST — asymmetric two-column, not a third card grid. */}
      <Section border="top">
        <ScrollReveal className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading eyebrow="Built to be trusted" title="Automate what webioom can prove." />
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
              When intent is ambiguous, webioom explains what to do instead of guessing — because a wrong automated
              change is worse than no change at all.
            </p>
            <div className="mt-6">
              <Link href="/security" className={buttonStyles({ variant: 'outline' })}>
                Read about security
              </Link>
            </div>
          </div>

          <div className="space-y-5">
            {TRUST_POINTS.map((point) => {
              const Icon = point.icon
              return (
                <div key={point.text} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm leading-relaxed text-gray-700">{point.text}</p>
                </div>
              )
            })}
          </div>
        </ScrollReveal>
      </Section>

      {/* 6. PRICING TEASER — a stat strip with dividers, not a fourth card grid. Depth lives on /pricing. */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading eyebrow="Simple pricing" title="Start free. Upgrade when you're ready." align="center" />
        </ScrollReveal>

        <ScrollReveal delayMs={100} className="mt-10 grid grid-cols-2 divide-y divide-border rounded-xl border border-border bg-surface sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {PLAN_ORDER.map((plan) => {
            const presentation = PLAN_PRESENTATION[plan]
            return (
              <div key={plan} className="p-6 text-center">
                <p className="text-sm font-semibold text-gray-900">{presentation.name}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
                  {presentation.monthlyPrice === null ? '€0' : `€${presentation.monthlyPrice}`}
                </p>
                <p className="text-xs text-muted">{presentation.monthlyPrice === null ? 'forever' : '/ month'}</p>
              </div>
            )
          })}
        </ScrollReveal>

        <ScrollReveal delayMs={160} className="mt-8 text-center">
          <Link href="/pricing" className="text-sm font-medium text-brand hover:text-brand-hover">
            See full pricing →
          </Link>
        </ScrollReveal>
      </Section>
    </>
  )
}
