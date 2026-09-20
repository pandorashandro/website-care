import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import Container from '@/components/ui/container'
import SectionHeading from '@/components/ui/section-heading'
import FaqAccordion, { type FaqItem } from '@/components/ui/faq-accordion'
import { buttonStyles } from '@/components/ui/button'
import PricingCards from './pricing-cards'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'webioom pricing — scan your website for free, then choose Bloom, Bloom Pro, or Agency to fix issues, improve performance, and keep your site healthy.',
}

/**
 * Pricing/Free-Scan Funnel task. Checkout only ever charges the plan's
 * MONTHLY Paddle price today (see lib/paddle/plan-mapping.ts) — the
 * Monthly/Yearly toggle below changes DISPLAYED pricing only, so a visitor
 * can compare the two, but does not yet start a separate annual Paddle
 * checkout (that would require creating new annual Paddle prices, which is
 * a manual Paddle-dashboard action outside this codebase's ability to
 * invent — see this task's final report for exactly what remains).
 */
const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Can I change my plan later?',
    answer:
      'Yes. You can upgrade to a higher plan at any time from your billing page, and the new plan applies as soon as checkout completes.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      "There's no separate trial — the Free Website Scan lets you see a real health report for one website before you pay anything, so you always know what you're getting.",
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'Payments are processed securely by Paddle, which supports major credit and debit cards.',
  },
  {
    question: 'What counts as a website?',
    answer: 'One website is one domain you connect to webioom for scanning and analysis — your plan sets how many you can manage at once.',
  },
  {
    question: 'What happens if I need more websites?',
    answer: "You can upgrade to a plan with a higher website limit at any time — your existing websites and reports carry over.",
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes. You can cancel your subscription at any time from your billing page — there is no minimum commitment.',
  },
  {
    question: 'Does the free website scan require a credit card?',
    answer: 'No. Scanning your first website is free and does not ask for payment details.',
  },
]

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
      <Container size="lg" className="py-16 text-center sm:py-20">
        <p className="text-sm font-semibold tracking-wide text-brand">Pricing</p>
        <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Choose the plan that fits your goals
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
          Scan your website for free and upgrade when you&apos;re ready to fix issues, improve performance, and keep your
          site healthy over time.
        </p>
      </Container>

      <Container size="xl" className="pb-16 sm:pb-20">
        <PricingCards isLoggedIn={isLoggedIn} currentPlan={currentPlan} />

        <p className="mt-10 text-center text-sm text-subtle">
          <span className="inline-flex items-center gap-1.5">Secure payments via Paddle</span>
          <span className="mx-2 text-border-strong">|</span>
          <span>Cancel anytime</span>
        </p>
      </Container>

      <div className="border-t border-border bg-surface-muted">
        <Container size="md" className="py-16 sm:py-20">
          <SectionHeading eyebrow="Pricing FAQ" title="Frequently asked questions" align="center" />
          <div className="mt-8">
            <FaqAccordion items={FAQ_ITEMS} />
          </div>
        </Container>
      </div>

      <Container size="md" className="py-16 text-center sm:py-20">
        <p className="text-sm font-semibold tracking-wide text-brand">Ready to get started?</p>
        <h2 className="mx-auto mt-2 max-w-xl text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
          Scan your website and see the difference
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted">
          Discover what&apos;s holding your website back and get a clear plan to improve it.
        </p>
        <div className="mt-6">
          <Link href="/signup" className={buttonStyles({ size: 'lg' })}>
            Scan your website for free
          </Link>
        </div>
      </Container>
    </>
  )
}
