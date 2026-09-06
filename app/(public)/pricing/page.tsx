import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import { PLAN_PRESENTATION, PLAN_ORDER } from '@/lib/billing/plan-presentation'
import { getPlanCtaKind } from '@/lib/billing/plan-cta'
import type { PlanKey } from '@/lib/entitlements/plans'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'
import UpgradePlanButton from '@/components/billing/upgrade-plan-button'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'webioom pricing — Free, Bloom, and Bloom Pro. Scan for free. Upgrade for more websites, and monitoring once it launches.',
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
        {plan === 'free' ? 'Start Free' : 'Get Started'}
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
    return (
      <span className="block text-center text-sm text-muted">
        Included in your plan
      </span>
    )
  }

  // kind === 'upgrade' — plan is 'bloom' | 'bloom_pro' here, never 'free'
  // (getPlanCtaKind never returns 'upgrade' for the free card, since free
  // is always rank 0 and nothing ranks below it).
  return <UpgradePlanButton plan={plan as 'bloom' | 'bloom_pro'} label={`Upgrade to ${PLAN_PRESENTATION[plan].name}`} />
}

function PlanCard({ plan, isLoggedIn, currentPlan, highlighted }: { plan: PlanKey; isLoggedIn: boolean; currentPlan: PlanKey; highlighted?: boolean }) {
  const presentation = PLAN_PRESENTATION[plan]

  return (
    <Card className={highlighted ? 'border-brand ring-1 ring-brand' : undefined}>
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-900">{presentation.name}</h3>
        {highlighted && <Badge tone="brand">Most popular</Badge>}
      </div>

      <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">{presentation.priceLabel}</p>
      <p className="mt-2 text-sm text-muted">{presentation.tagline}</p>

      <ul className="mt-6 space-y-2.5 text-sm text-gray-700">
        {presentation.liveFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
        {presentation.plannedFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
            <span>
              {feature}
              <span className="block text-xs text-subtle">{presentation.plannedNote}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <PlanCta plan={plan} isLoggedIn={isLoggedIn} currentPlan={currentPlan} />
      </div>
    </Card>
  )
}

export default async function PricingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoggedIn = !!user
  // getCurrentUserEntitlements() resolves to the free plan whenever there
  // is no session at all, so this is safe to call unconditionally — for a
  // logged-out visitor its result is simply never read for CTA purposes
  // (isLoggedIn === false always yields 'signup' before currentPlan is
  // ever consulted).
  const entitlements = await getCurrentUserEntitlements()
  const currentPlan = entitlements.plan

  return (
    <>
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">Pricing</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Simple plans for a healthier website.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Scan for free. Upgrade when you want more websites — and monitoring, once it launches.
          </p>
        </Container>
      </div>

      <Container size="lg" className="py-16 sm:py-20">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLAN_ORDER.map((plan) => (
            <PlanCard key={plan} plan={plan} isLoggedIn={isLoggedIn} currentPlan={currentPlan} highlighted={plan === 'bloom'} />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-subtle">
          Prices shown in EUR, billed monthly. No credit card required for Free.{' '}
          <Link href="/security" className="font-medium text-brand hover:text-brand-hover">
            Read about how billing and credentials are kept safe
          </Link>
          .
        </p>
      </Container>

      <SectionHeading
        eyebrow="Honest by design"
        title="What's live today, and what's coming"
        align="center"
        className="px-4 pb-4"
      />
      <Container size="md" className="pb-16 text-center sm:pb-20">
        <p className="text-sm text-muted">
          Website scanning, prioritization, and supported direct fixes are fully live today on every plan where
          currently allowed. Weekly and daily automatic monitoring — and the alerts built on top of it — are
          entitlements reserved by your plan now, but the monitoring engine itself has not launched yet. We&apos;ll
          never tell you a feature is running when it isn&apos;t.
        </p>
      </Container>
    </>
  )
}
