import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Server, Accessibility, Gauge, FileText } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Website Health',
  description:
    'What "website health" means in Website Care: the five report categories, health scores, severity, priority, and how to read a report.',
}

const CATEGORIES = [
  {
    icon: Search,
    name: 'SEO',
    description: 'Whether search engines and social platforms can understand and represent your pages correctly.',
    examples: [
      'Page titles and meta descriptions that are missing or an ineffective length',
      'Missing or duplicated heading structure (e.g. more than one H1)',
      'Canonical tags that are missing, invalid, or point somewhere unexpected',
      'Missing Open Graph tags, which affects how links look when shared',
      'Pages accidentally excluded from search results, or an unreachable/invalid sitemap',
    ],
  },
  {
    icon: Server,
    name: 'Technical',
    description: 'Whether your pages are reliably reachable and correctly configured at the infrastructure level.',
    examples: [
      'Pages that are unreachable, return a server error, or a 404',
      'Missing HTTPS, or HTTPS that redirects back to an insecure HTTP URL',
      'Redirect chains and redirect loops',
      'robots.txt or your sitemap being unreachable',
    ],
  },
  {
    icon: Accessibility,
    name: 'Accessibility',
    description: 'Whether your site is usable by visitors who rely on assistive technology like screen readers.',
    examples: [
      'Images missing descriptive alt text',
      'A missing page language attribute',
      'Links or buttons with no readable text for screen readers',
    ],
  },
  {
    icon: Gauge,
    name: 'Performance',
    description: 'How quickly your pages respond and how much unnecessary weight they carry.',
    examples: ['Slow initial page response', 'Unusually large HTML documents'],
  },
  {
    icon: FileText,
    name: 'Content',
    description: 'Whether a page actually offers enough for a visitor — or a search engine — to understand it.',
    examples: ['Pages with very little visible text content'],
  },
]

const SEVERITY_ROWS: { label: string; tone: BadgeTone; description: string }[] = [
  { label: 'Critical', tone: 'danger', description: 'Serious problems likely to affect most visitors or search visibility.' },
  { label: 'High', tone: 'danger', description: 'Significant issues worth addressing soon.' },
  { label: 'Medium', tone: 'warning', description: 'Real issues that matter, but are less urgent.' },
  { label: 'Low', tone: 'info', description: 'Smaller refinements and best-practice items.' },
]

export default function WebsiteHealthPage() {
  return (
    <>
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">Website Health</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            What we mean by a healthy website
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            &ldquo;Health&rdquo; isn&apos;t one abstract score — it&apos;s a set of specific, real checks across
            five categories, organized so you can see exactly what needs attention and why.
          </p>
        </Container>
      </div>

      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading
          eyebrow="Report categories"
          title="Five categories, each with real checks"
          description="These are the categories every Website Care report is organized into. The examples below are checks Website Care actually performs today."
        />

        <div className="mt-10 space-y-5">
          {CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <Card key={category.name} className="sm:flex sm:gap-6">
                <div className="flex items-center gap-3 sm:w-56 sm:shrink-0 sm:flex-col sm:items-start">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{category.name}</h3>
                    <p className="mt-1 text-sm text-muted sm:mt-2">{category.description}</p>
                  </div>
                </div>

                <ul className="mt-4 space-y-1.5 border-t border-border pt-4 sm:mt-0 sm:flex-1 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                  {category.examples.map((example) => (
                    <li key={example} className="text-sm text-gray-700">
                      {example}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      </Container>

      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading eyebrow="Reading a report" title="How a report is organized" />

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="text-base font-semibold text-gray-900">Health score</h3>
              <p className="mt-2 text-sm text-muted">
                Every scan produces an overall health score, plus a score for each of the five categories
                above. It&apos;s a snapshot of your most recent scan, not a fixed grade — rescanning after
                changes produces a fresh result.
              </p>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-gray-900">Severity</h3>
              <p className="mt-2 text-sm text-muted">Every issue is labeled with how much impact it tends to have:</p>
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
              <h3 className="text-base font-semibold text-gray-900">Priority &amp; affected pages</h3>
              <p className="mt-2 text-sm text-muted">
                Reports highlight the issues most worth addressing first, and list exactly which pages each
                issue affects — so you&apos;re never guessing where a problem actually is.
              </p>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-gray-900">Recommendations</h3>
              <p className="mt-2 text-sm text-muted">
                Every issue comes with a plain-language recommendation. For a supported set of issues,
                Website Care can also prepare the fix itself for your review.
              </p>
            </Card>
          </div>

          <div className="mt-10 text-center">
            <Link href="/product" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
              See how fixing works
            </Link>
          </div>
        </Container>
      </div>
    </>
  )
}
