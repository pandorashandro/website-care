import type { Metadata } from 'next'
import Link from 'next/link'
import { Image as ImageIcon, ListOrdered, Users } from 'lucide-react'
import Container from '@/components/ui/container'
import Section from '@/components/ui/section'
import ScrollReveal from '@/components/ui/scroll-reveal'
import Card from '@/components/ui/card'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import HealthGauge from '@/components/ui/health-gauge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'
import { PILLAR_IDENTITY, type PillarKey } from '@/components/website/pillar-identity'

export const metadata: Metadata = {
  title: 'Website Health',
  description: 'What "website health" means in webioom: the seven canonical pillars, how the health score works, severity vs. priority, and recommendations.',
}

const CATEGORIES: { key: PillarKey; name: string; why: string }[] = [
  { key: 'technical-seo', name: 'Technical SEO', why: 'Is every page reliably reachable, secure, and correctly indexed?' },
  { key: 'on-page-seo', name: 'On-Page SEO', why: 'Do your titles, headings, and metadata correctly represent each page?' },
  { key: 'content', name: 'Content', why: 'Does each page have enough substance to earn trust and rank?' },
  { key: 'site-architecture', name: 'Site Architecture', why: 'Can every important page actually be discovered through your links?' },
  { key: 'performance', name: 'Performance', why: 'Do pages load fast enough that visitors stay?' },
  { key: 'accessibility', name: 'Accessibility', why: 'Can assistive technology actually use your site?' },
  { key: 'security', name: 'Security', why: 'Does your site follow baseline practices that protect visitors?' },
]

const SEVERITY_ROWS: { label: string; tone: BadgeTone; description: string }[] = [
  { label: 'Critical', tone: 'danger', description: 'Likely to affect most visitors or search visibility.' },
  { label: 'High', tone: 'danger', description: 'Significant — worth addressing soon.' },
  { label: 'Medium', tone: 'warning', description: 'Real, but less urgent.' },
  { label: 'Low', tone: 'info', description: 'Smaller refinements.' },
]

export default function WebsiteHealthPage() {
  return (
    <>
      {/* HERO */}
      <Section tint="muted" border="bottom" size="lg" containerClassName="text-center">
        <p className="text-sm font-semibold tracking-wide text-brand">Website Health</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Website health is more than SEO.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          webioom evaluates your site across seven real pillars and organizes the results into one clearer view.
        </p>
      </Section>

      {/*
        OVERALL WEBSITE HEALTH — the page's dark flagship moment (Sprint 3,
        Prompt 2B closed batch, Section 24: purpose = make the single
        number this whole product revolves around actually memorable,
        instead of explained in three paragraphs of text).
      */}
      <Section tint="dark">
        <ScrollReveal className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex justify-center lg:justify-start">
            <HealthGauge score={87} size="lg" aria-label="Example Overall Website Health: 87 out of 100" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-vivid">Overall Website Health</p>
            <h2 className="mt-2 text-2xl font-semibold text-text-on-dark sm:text-3xl">One score, built from all seven pillars</h2>
            <p className="mt-4 text-sm leading-relaxed text-text-on-dark-muted">
              Every completed scan produces this score from the issues found across your site — weighted by how many
              pages, especially your homepage, each one affects. It&apos;s a snapshot of your latest scan, not a permanent
              grade: rescan after changes and it moves.
            </p>
            <p className="mt-3 text-xs text-text-on-dark-muted/70">Illustrative example — not a live report.</p>
          </div>
        </ScrollReveal>
      </Section>

      {/* SEVEN PILLARS */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading eyebrow="Report pillars" title="Seven pillars behind that one number" />

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((category) => {
              const identity = PILLAR_IDENTITY[category.key]
              const Icon = identity.icon
              return (
                <Card key={category.key} className="overflow-hidden border-l-4" padding="md" style={{ borderLeftColor: identity.accent }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: identity.accentSubtleBg, color: identity.accent }}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{category.name}</h3>
                  </div>
                  <p className="mt-3 text-sm text-muted">{category.why}</p>
                </Card>
              )
            })}
          </div>
        </ScrollReveal>
      </Section>

      {/* FIX THESE FIRST + SIMPLE/EXPERT */}
      <Section>
        <ScrollReveal>
          <SectionHeading eyebrow="From report to action" title="Fix These First, and two ways to read it" />

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                <ListOrdered className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Fix These First</h3>
              <p className="mt-2 text-sm text-muted">
                webioom&apos;s own priority feed — the highest-impact problems across your whole site, ranked in
                the order worth acting on, with whether webioom can help you fix each one.
              </p>
            </Card>

            <Card>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Simple / Expert</h3>
              <p className="mt-2 text-sm text-muted">
                Every finding has two views: Simple shows what&apos;s wrong, why it matters, and what to do.
                Expert adds the technical evidence behind it — same data, different depth.
              </p>
            </Card>
          </div>
        </ScrollReveal>
      </Section>

      {/*
        READING A REPORT — consolidated. Previously three separate full-width
        sections (Severity vs Priority / Affected Pages / Recommendations)
        each repeated the same "Reading a report" eyebrow — collapsed into
        one section since they're one continuous idea, not three.
      */}
      <Section tint="muted" border="top">
        <ScrollReveal>
          <SectionHeading eyebrow="Reading a report" title="Severity, priority, and what to do next" />

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="text-base font-semibold text-gray-900">Severity</h3>
              <p className="mt-2 text-sm text-muted">A fixed property of the issue type itself:</p>
              <ul className="mt-3 space-y-2">
                {SEVERITY_ROWS.map((row) => (
                  <li key={row.label} className="flex items-center gap-2">
                    <Badge tone={row.tone}>{row.label}</Badge>
                    <span className="text-sm text-muted">{row.description}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-gray-900">Priority</h3>
              <p className="mt-2 text-sm text-muted">
                How strongly webioom recommends acting on this finding right now, relative to everything else in the report.
              </p>
              <p className="mt-3 text-sm text-gray-700">
                Two findings can share a severity but differ in priority — the one affecting your homepage and a dozen
                other pages ranks higher than the same issue on one rarely-visited page.
              </p>
            </Card>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card padding="md">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted" aria-hidden="true" />
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">Example only</p>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-900">Missing image alt text · 4 pages affected</p>
              <p className="mt-1 text-sm text-muted">webioom groups repeated findings into one entry per issue, so you can tell an isolated slip from a template-wide pattern.</p>
            </Card>

            <Card padding="md">
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">Every finding includes</p>
              <p className="mt-2 text-sm text-gray-700">Why it was flagged, a specific recommendation, exactly which pages, and — where supported — a Safe, AI-Assisted, or Guided fix.</p>
            </Card>
          </div>
        </ScrollReveal>
      </Section>

      {/* REPORT → ACTION CONNECTION */}
      <div className="border-t border-border">
        <Container size="md" className="py-16 text-center sm:py-24">
          <ScrollReveal>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              From a report entry to a resolved issue
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">
              Supported fixes move through Prepare, Review, Apply, and Verify — everything else stays a clear, guided
              recommendation you can act on yourself.
            </p>
            <div className="mt-6">
              <Link href="/product" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
                See How It Works
              </Link>
            </div>
          </ScrollReveal>
        </Container>
      </div>
    </>
  )
}
