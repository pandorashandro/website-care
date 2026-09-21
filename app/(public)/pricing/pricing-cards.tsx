'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Clock, Sparkles, Sprout, Leaf, Users, ArrowRight } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import { buttonStyles } from '@/components/ui/button'
import ScrollReveal from '@/components/ui/scroll-reveal'
import UpgradePlanButton from '@/components/billing/upgrade-plan-button'
import { PLAN_PRESENTATION } from '@/lib/billing/plan-presentation'
import { getPlanCtaKind } from '@/lib/billing/plan-cta'
import type { PlanKey } from '@/lib/entitlements/plans'
import type { PaddlePlanKey } from '@/lib/paddle/plan-mapping'
import { cn } from '@/lib/ui/cn'

type BillingCycle = 'monthly' | 'yearly'
type PaidPlanKey = 'bloom' | 'bloom_pro' | 'agency'

const PAID_PLAN_ORDER: PaidPlanKey[] = ['bloom', 'bloom_pro', 'agency']

type PlanAccent = { badgeTone: BadgeTone; iconWrap: string; icon: typeof Sparkles; highlightRing: string; topBar: string }

const PLAN_ACCENT: Record<PaidPlanKey, PlanAccent> = {
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
      <Link href="/signup" className={buttonStyles({ variant: 'primary', className: 'w-full' })}>
        Get {PLAN_PRESENTATION[plan].name}
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

  // kind === 'upgrade'
  return <UpgradePlanButton plan={plan as PaddlePlanKey} label={`Get ${PLAN_PRESENTATION[plan].name}`} />
}

function PriceDisplay({ plan, cycle }: { plan: PaidPlanKey; cycle: BillingCycle }) {
  const presentation = PLAN_PRESENTATION[plan]
  const monthlyPrice = presentation.monthlyPrice as number
  const annualPrice = presentation.annualPrice as number

  if (cycle === 'monthly') {
    return (
      <div className="mt-4">
        <span className="text-4xl font-bold tracking-tight text-gray-900">€{monthlyPrice}</span>
        <span className="text-base font-medium text-muted"> / month</span>
        <p className="mt-1 text-sm text-muted">€{annualPrice.toLocaleString('en-IE')} billed yearly</p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <span className="text-4xl font-bold tracking-tight text-gray-900">€{annualPrice.toLocaleString('en-IE')}</span>
      <span className="text-base font-medium text-muted"> / year</span>
      <p className="mt-1 text-sm text-muted">≈ €{Math.round(annualPrice / 12)}/month, billed yearly</p>
    </div>
  )
}

function PlanCard({ plan, cycle, isLoggedIn, currentPlan }: { plan: PaidPlanKey; cycle: BillingCycle; isLoggedIn: boolean; currentPlan: PlanKey }) {
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

        {/* The website limit is the single biggest differentiator between paid plans — given its own visual weight instead of being buried as one bullet among ten. */}
        <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-gray-700">
          Up to {presentation.maxWebsites} website{presentation.maxWebsites === 1 ? '' : 's'}
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

/**
 * Sprint 3, Prompt 2B (closed public batch) — Free is deliberately no
 * longer a fourth card competing visually with the three paid tiers it can
 * never actually compare against (it has no website-count tier to climb,
 * no monthly price, no upgrade path of its own — it's the on-ramp, not a
 * rung on the same ladder). Presenting it as a quiet horizontal banner
 * above the real comparison gives the three paid cards room to actually
 * be compared against each other, which is what a customer choosing
 * between Bloom/Bloom Pro/Agency needs, not a fourth white box.
 */
function FreeScanBanner({ isLoggedIn, currentPlan }: { isLoggedIn: boolean; currentPlan: PlanKey }) {
  const kind = getPlanCtaKind('free', isLoggedIn, currentPlan)
  const presentation = PLAN_PRESENTATION.free

  return (
    <Card padding="md" className="flex flex-col items-start gap-4 border-dashed sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-gray-600">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">Not ready to commit? Scan one website free.</p>
          <p className="mt-0.5 text-xs text-muted">{presentation.liveFeatures.slice(0, 3).join(' · ')}</p>
        </div>
      </div>
      {kind === 'current' ? (
        <span className="text-sm font-medium text-subtle">Your current plan</span>
      ) : (
        <Link href="/signup" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-hover">
          Scan your website
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </Card>
  )
}

export default function PricingCards({ isLoggedIn, currentPlan }: { isLoggedIn: boolean; currentPlan: PlanKey }) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  return (
    <div>
      <ScrollReveal>
        <FreeScanBanner isLoggedIn={isLoggedIn} currentPlan={currentPlan} />
      </ScrollReveal>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
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

      <ScrollReveal delayMs={80} className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PAID_PLAN_ORDER.map((plan) => (
          <PlanCard key={plan} plan={plan} cycle={cycle} isLoggedIn={isLoggedIn} currentPlan={currentPlan} />
        ))}
      </ScrollReveal>
    </div>
  )
}
