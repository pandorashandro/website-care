import type { Metadata } from 'next'
import { ShieldCheck, CalendarX, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserEntitlements } from '@/lib/entitlements'
import Container from '@/components/ui/container'
import Section from '@/components/ui/section'
import ScrollReveal from '@/components/ui/scroll-reveal'
import SectionHeading from '@/components/ui/section-heading'
import FaqAccordion, { type FaqItem } from '@/components/ui/faq-accordion'
import PricingCards from './pricing-cards'

const VALUE_POINTS = [
  { icon: ShieldCheck, title: 'Secure payments', description: 'Every payment is processed by Paddle — webioom never sees or stores your card details.' },
  { icon: CalendarX, title: 'Cancel anytime', description: 'No minimum commitment. Cancel from your billing page whenever you want.' },
  { icon: CreditCard, title: 'No card for the free scan', description: 'See a real health report for one website before you ever enter payment details.' },
]

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
      <Container size="lg" className="pb-4 pt-20 text-center sm:pt-24">
        <p className="text-sm font-semibold tracking-wide text-brand">Pricing</p>
        <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Choose the plan that fits your goals
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Scan your website for free and upgrade when you&apos;re ready to fix issues, improve performance, and keep your
          site healthy over time.
        </p>
      </Container>

      {/*
        Sprint 3 (monitoring + notifications completion) — width fix: four
        plan cards in `size="xl"` (max-w-6xl, 1152px) left each card too
        narrow, causing feature copy to wrap awkwardly. `2xl` is this design
        system's existing wide-desktop container (max-w-[1440px], built for
        exactly this "too much unused space at modern desktop widths"
        problem — see components/ui/container.tsx's own doc comment) rather
        than a new hardcoded width.
      */}
      <Container size="2xl" className="pb-20 pt-8 sm:pb-24">
        <PricingCards isLoggedIn={isLoggedIn} currentPlan={currentPlan} />
      </Container>

      {/*
        Sprint 3, Prompt 2B (final continuation) — a deliberate dark band
        (Section 24: every dark section needs a purpose) replacing what was
        a single gray caption line beneath the cards. Its purpose is
        conversion trust at exactly the moment someone is deciding whether
        to pay — the same three facts the FAQ already states, now given
        real visual weight instead of being buried as a footnote.
      */}
      <Section tint="dark" border="top">
        <ScrollReveal className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {VALUE_POINTS.map((point) => {
            const Icon = point.icon
            return (
              <div key={point.title} className="text-center sm:text-left">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-brand-vivid sm:mx-0">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-text-on-dark">{point.title}</h3>
                <p className="mt-1.5 text-sm text-text-on-dark-muted">{point.description}</p>
              </div>
            )
          })}
        </ScrollReveal>
      </Section>

      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading eyebrow="Pricing FAQ" title="Frequently asked questions" align="center" />
        </ScrollReveal>
        <ScrollReveal delayMs={80} className="mt-8">
          <FaqAccordion items={FAQ_ITEMS} />
        </ScrollReveal>
      </Section>
    </>
  )
}
