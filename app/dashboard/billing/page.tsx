import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import { getSubscriptionDisplayInfo } from './subscription-display'
import { PLAN_PRESENTATION, PLAN_ORDER } from '@/lib/billing/plan-presentation'
import { getPlanCtaKind } from '@/lib/billing/plan-cta'
import { getSubscriptionStatusLabel } from '@/lib/billing/status-labels'
import { formatWebsiteUsage } from '@/lib/billing/website-usage'
import { hasStoredPaddleCustomer } from '@/lib/billing/portal-eligibility'
import type { PlanKey } from '@/lib/entitlements/plans'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import UpgradePlanButton from '@/components/billing/upgrade-plan-button'
import ManageBillingButton from '@/components/billing/manage-billing-button'
import PostCheckoutBanner from '@/components/billing/post-checkout-banner'

export const metadata: Metadata = {
  title: 'Billing',
}

function isPlanKey(value: string): value is PlanKey {
  return value === 'free' || value === 'bloom' || value === 'bloom_pro'
}

export default async function BillingPage(props: PageProps<'/dashboard/billing'>) {
  const searchParams = await props.searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [entitlements, subscriptionInfo, { count: websiteCount }] = await Promise.all([
    getCurrentUserEntitlements(),
    getSubscriptionDisplayInfo(),
    supabase.from('websites').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const currentPlan = entitlements.plan
  const presentation = PLAN_PRESENTATION[currentPlan]
  const statusLabel = getSubscriptionStatusLabel(subscriptionInfo.status)
  const showManageBilling = hasStoredPaddleCustomer(subscriptionInfo.providerCustomerId)

  const checkoutParam = typeof searchParams.checkout === 'string' ? searchParams.checkout : null
  const expectedPlan = checkoutParam && isPlanKey(checkoutParam) ? checkoutParam : null

  const upgradeOptions = PLAN_ORDER.filter((plan) => getPlanCtaKind(plan, true, currentPlan) === 'upgrade')

  return (
    <Container size="md" className="py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
      <p className="mt-1 text-sm text-muted">Your current plan, usage, and billing management.</p>

      {expectedPlan && (
        <div className="mt-6">
          <PostCheckoutBanner expectedPlan={expectedPlan} currentPlan={currentPlan} />
        </div>
      )}

      <Card className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">{presentation.name}</h2>
          {entitlements.subscriptionInactive && <Badge tone="warning">Needs attention</Badge>}
          <Badge tone={statusLabel.tone}>{statusLabel.label}</Badge>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-subtle">Websites</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatWebsiteUsage(websiteCount ?? 0, entitlements.maxWebsites)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-subtle">Monitoring</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {entitlements.monitoringCadence === 'none' ? (
                'Not included on this plan'
              ) : (
                <>
                  {entitlements.monitoringCadence === 'weekly' ? 'Weekly' : 'Daily'}
                  <span className="block text-xs text-subtle">{presentation.plannedNote}</span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-subtle">Alerts</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {entitlements.alertsAllowed ? (
                <>
                  Included
                  <span className="block text-xs text-subtle">{presentation.plannedNote}</span>
                </>
              ) : (
                'Not included on this plan'
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">What&apos;s included</p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
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
        </div>

        {showManageBilling && (
          <div className="mt-5 border-t border-border pt-4">
            <ManageBillingButton />
          </div>
        )}
      </Card>

      {upgradeOptions.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Upgrade</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {upgradeOptions.map((plan) => {
              const optionPresentation = PLAN_PRESENTATION[plan]
              return (
                <Card key={plan} padding="sm">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{optionPresentation.name}</h3>
                    <span className="text-sm font-semibold text-gray-900">{optionPresentation.priceLabel}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{optionPresentation.tagline}</p>
                  <div className="mt-3">
                    <UpgradePlanButton plan={plan as 'bloom' | 'bloom_pro'} label={`Upgrade to ${optionPresentation.name}`} />
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-subtle">
        <Link href="/pricing" className="font-medium text-brand hover:text-brand-hover">
          Compare all plans
        </Link>
      </p>
    </Container>
  )
}
