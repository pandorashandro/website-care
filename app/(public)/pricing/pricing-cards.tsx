'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Clock, Sparkles, Sprout, Leaf, Users } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import { buttonStyles } from '@/components/ui/button'
import ScrollReveal from '@/components/ui/scroll-reveal'
import UpgradePlanButton from '@/components/billing/upgrade-plan-button'
import { PLAN_PRESENTATION, PLAN_ORDER } from '@/lib/billing/plan-presentation'
import { getPlanCtaKind } from '@/lib/billing/plan-cta'
import type { PlanKey } from '@/lib/entitlements/plans'
import type { PaddlePlanKey } from '@/lib/paddle/plan-mapping'
import { cn } from '@/lib/ui/cn'

type BillingCycle = 'monthly' | 'yearly'

type PlanAccent = { badgeTone: BadgeTone; iconWrap: string; icon: typeof Sparkles; highlightRing: string; topBar: string }

/**
 * Sprint 3, Prompt 2B (targeted correction) — Free was removed from this
 * grid in the previous pass as "not a rung on the same ladder," which the
 * founder correctly identified as a product-truth regression: Free
 * Website Scan IS one of the four real plans and must be visibly
 * comparable alongside Bloom/Bloom Pro/Agency, not relegated to a banner
 * outside the pricing comparison. It keeps a deliberately quieter visual
 * treatment (neutral accent, no highlight, no ring) so the three paid
 * tiers still read as the main upgrade decision — but it is a full card
 * in the same grid, not a second-class element.
 */
const PLAN_ACCENT: Record<PlanKey, PlanAccent> = {
  free: { badgeTone: 'neutral', iconWrap: 'bg-surface-muted text-gray-600', icon: Sparkles, highlightRing: '', topBar: 'bg-border-strong' },
  bloom: { badgeTone: 'brand', iconWrap: 'bg-brand-subtle text-brand', icon: Sprout, highlightRing: '', topBar: 'bg-brand-vivid' },
  bloom_pro: { badgeTone: 'violet', iconWrap: 'bg-violet-subtle text-violet', icon: Leaf, highlightRing: 'border-violet ring-1 ring-violet', topBar: '' },
  agency: { badgeTone: 'sky', iconWrap: 'bg-sky-subtle text-sky', icon: Users, highlightRing: '', topBar: 'bg-sky' },
}

/**
 * The only place a plan card decides what to show for the current viewer
 * — always via the shared, pure `getPlanCtaKind` so `/dashboard/billing`
 * can never disagree with this page about who is eligible to upgrade.
 */
function PlanCta({ plan, isLoggedIn, currentPlan }: { plan: PlanKey; isLoggedIn: boolean; currentPlan: PlanKey }) {
  const kind = getPlanCtaKind(plan, isLoggedIn, currentPlan)

  if (kind === 'signup') {
    return (
      <Link href="/signup" className={buttonStyles({ variant: plan === 'free' ? 'outline' : 'primary', className: 'w-full' })}>
        {plan === 'free' ? 'Scan your website' : `Get ${PLAN_PRESENTATION[plan].name}`}
      </Link>
    )
  }

  if (kind === 'current') {
    return (
      <span className={buttonStyles({ variant: 'outline', className: 'w-full cursor-default opacity-75' })} aria-current="true">
        Current Plan
      </span>
    )
  }

  if (kind === 'included') {
    return <span className="block text-center text-sm text-muted">Included in your plan</span>
  }

  // kind === 'upgrade' — plan is never 'free' here (getPlanCtaKind never returns 'upgrade' for the free card).
  return <UpgradePlanButton plan={plan as PaddlePlanKey} label={`Get ${PLAN_PRESENTATION[plan].name}`} />
}

function PriceDisplay({ plan, cycle }: { plan: PlanKey; cycle: BillingCycle }) {
  const presentation = PLAN_PRESENTATION[plan]

  if (presentation.monthlyPrice === null || presentation.annualPrice === null) {
    return (
      <div className="mt-4">
        <span className="text-4xl font-bold tracking-tight text-gray-900">€0</span>
      </div>
    )
  }

  if (cycle === 'monthly') {
    return (
      <div className="mt-4">
        <span className="text-4xl font-bold tracking-tight text-gray-900">€{presentation.monthlyPrice}</span>
        <span className="text-base font-medium text-muted"> / month</span>
        <p className="mt-1 text-sm text-muted">€{presentation.annualPrice.toLocaleString('en-IE')} billed yearly</p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <span className="text-4xl font-bold tracking-tight text-gray-900">€{presentation.annualPrice.toLocaleString('en-IE')}</span>
      <span className="text-base font-medium text-muted"> / year</span>
      <p className="mt-1 text-sm text-muted">≈ €{Math.round(presentation.annualPrice / 12)}/month, billed yearly</p>
    </div>
  )
}

function PlanCard({ plan, cycle, isLoggedIn, currentPlan }: { plan: PlanKey; cycle: BillingCycle; isLoggedIn: boolean; currentPlan: PlanKey }) {
  const presentation = PLAN_PRESENTATION[plan]
  const accent = PLAN_ACCENT[plan]
  const Icon = accent.icon
  const highlighted = plan === 'bloom_pro'

  return (
    <Card
      padding="none"
      className={cn(
        'flex flex-col overflow-hidden motion-hover-lift motion-safe:animate-[webioom-rise-in_var(--duration-reveal)_var(--ease-out)_both]',
        highlighted ? cn(accent.highlightRing, 'shadow-lg lg:-translate-y-3') : undefined
      )}
    >
      <div className={cn('h-1.5 w-full', highlighted ? '' : accent.topBar)} style={highlighted ? { background: 'var(--brand-gradient)' } : undefined} aria-hidden="true" />

      <div className={cn('flex flex-1 flex-col p-6', highlighted && 'lg:p-7')}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', accent.iconWrap)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          {highlighted && <Badge tone={accent.badgeTone}>Most Popular</Badge>}
        </div>

        <h3 className="mt-4 text-lg font-semibold text-gray-900">{presentation.cardTitle}</h3>
        <p className="mt-1 text-sm text-muted">{presentation.tagline}</p>

        <PriceDisplay plan={plan} cycle={cycle} />

        {/* The website limit is the single biggest differentiator between plans — given its own visual weight instead of being buried as one bullet among many. */}
        <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-gray-700">
          {presentation.maxWebsites === 1 ? '1 website' : `Up to ${presentation.maxWebsites} websites`}
        </p>

        <div className="mt-5">
          <PlanCta plan={plan} isLoggedIn={isLoggedIn} currentPlan={currentPlan} />
        </div>

        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-gray-700">
          {presentation.liveFeatures
            .filter((feature) => !/^(up to )?\d+ websites?$/i.test(feature))
            .map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          {presentation.plannedFeatures.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
              <span>
                {feature} <span className="text-xs text-subtle">({presentation.plannedNote})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

export default function PricingCards({ isLoggedIn, currentPlan }: { isLoggedIn: boolean; currentPlan: PlanKey }) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex items-center rounded-full border border-border bg-surface p-1" role="group" aria-label="Billing cycle">
          <button
            type="button"
            onClick={() => setCycle('monthly')}
            aria-pressed={cycle === 'monthly'}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              cycle === 'monthly' ? 'bg-brand-dark text-text-on-dark shadow-sm' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle('yearly')}
            aria-pressed={cycle === 'yearly'}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              cycle === 'yearly' ? 'bg-brand-dark text-text-on-dark shadow-sm' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Yearly
          </button>
        </div>
        <span className="text-sm font-semibold text-brand">Save 2 months</span>
      </div>

      <ScrollReveal delayMs={80} className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((plan) => (
          <PlanCard key={plan} plan={plan} cycle={cycle} isLoggedIn={isLoggedIn} currentPlan={currentPlan} />
        ))}
      </ScrollReveal>
    </div>
  )
}
