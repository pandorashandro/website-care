import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Server, Accessibility, Gauge, FileText, Image as ImageIcon } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { buttonStyles } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Website Health',
  description:
    'What "website health" means in webioom: the five real report categories, how the health score works, severity vs. priority, affected pages, and recommendations.',
}

const CATEGORIES = [
  {
    icon: Search,
    name: 'SEO',
    why: 'Search engines and social platforms rely on specific signals to represent your pages correctly — when those signals are missing or wrong, your pages are harder to find and less compelling to click.',
    examples: [
      'Page titles and meta descriptions that are missing or an ineffective length',
      'Missing or duplicated heading structure (e.g. more than one H1)',
      'Canonical tags that are missing, invalid, or point somewhere unexpected',
      'Missing Open Graph tags, which affects how links look when shared',
      'Pages accidentally excluded from search results, and an unreachable or invalid sitemap',
    ],
  },
  {
    icon: Server,
    name: 'Technical',
    why: 'None of the rest matters if a page isn’t reliably reachable — technical problems can quietly cost you visitors and search visibility without any visual sign on the page itself.',
    examples: [
      'Pages that are unreachable, return a server error, or a 404',
      'Missing HTTPS, or HTTPS that redirects back to an insecure HTTP URL',
      'Redirect chains and redirect loops',
      'Internal links that point to broken, missing, or redirecting pages',
      'robots.txt or your sitemap being unreachable',
    ],
  },
  {
    icon: Accessibility,
    name: 'Accessibility',
    why: 'A meaningful share of visitors use assistive technology like screen readers — accessibility issues can make parts of your site effectively invisible to them.',
    examples: [
      'Images missing descriptive alt text',
      'A missing page language attribute',
      'Links or buttons with no readable text for screen readers',
    ],
  },
  {
    icon: Gauge,
    name: 'Performance',
    why: 'Slow or bloated pages lose visitors before they see anything — response speed and page weight directly shape first impressions.',
    examples: ['Slow initial page response', 'Unusually large HTML documents'],
  },
  {
    icon: FileText,
    name: 'Content',
    why: 'A page with almost nothing on it gives visitors and search engines little reason to trust or rank it.',
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
      {/* 7. HERO */}
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">Website Health</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Website health is more than SEO.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            webioom evaluates your site across five real dimensions and organizes the results into one
            clearer view — not just how you rank in search.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {CATEGORIES.map((category) => (
              <Badge key={category.name} tone="brand">
                {category.name}
              </Badge>
            ))}
          </div>
        </Container>
      </div>

      {/* 8. HEALTH SCORE */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading eyebrow="The health score" title="What the number actually represents" />

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4 text-sm leading-relaxed text-gray-700">
            <p>
              Every completed scan produces an overall health score, plus a score for each of the five
              categories above. Each category starts from a clean baseline and is reduced by the issues
              found in it — more serious issues reduce it more than minor ones.
            </p>
            <p>
              Reach matters too: the same kind of issue affecting many pages — especially your homepage —
              counts for more than an isolated instance on one rarely-visited page. The five category scores
              don&apos;t contribute equally to the overall number either; some categories tend to affect a
              site as a whole more than others.
            </p>
            <p>
              The score is a snapshot of your most recent scan, not a permanent grade — rescanning after
              changes produces a fresh result. It&apos;s meant to be read alongside issue priority and
              severity, not used as the only signal on its own.
            </p>
          </div>

          <div>
            <Card padding="md">
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                Example only — not a live report
              </p>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">Same severity, different impact</h3>
              <p className="mt-1 text-sm text-muted">
                Two medium-severity issues can reduce a category score by very different amounts.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700">Medium issue &middot; 1 page affected</span>
                    <Badge tone="warning">Medium</Badge>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full w-[12%] rounded-full bg-amber-500" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700">Medium issue &middot; homepage + 11 pages</span>
                    <Badge tone="warning">Medium</Badge>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full w-[45%] rounded-full bg-amber-500" />
                  </div>
                </div>
              </div>

              <p className="mt-4 text-xs text-subtle">Bars illustrate relative score impact only, not real point values.</p>
            </Card>
          </div>
        </div>
      </Container>

      {/* 9. FIVE CATEGORIES */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading
            eyebrow="Report categories"
            title="Five categories, each with real checks"
            description="These are the categories every webioom report is organized into. The examples below are checks webioom actually performs today."
          />

          <div className="mt-10 space-y-5">
            {CATEGORIES.map((category) => {
              const Icon = category.icon
              return (
                <Card key={category.name} className="lg:flex lg:gap-8">
                  <div className="lg:w-64 lg:shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-subtle text-brand">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">{category.name}</h3>
                    </div>
                    <p className="mt-3 text-sm text-muted">{category.why}</p>
                  </div>

                  <ul className="mt-4 space-y-1.5 border-t border-border pt-4 lg:mt-0 lg:flex-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
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
      </div>

      {/* 10. SEVERITY VS PRIORITY */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading eyebrow="Reading a report" title="Severity vs. priority" />

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <h3 className="text-base font-semibold text-gray-900">Severity</h3>
            <p className="mt-2 text-sm text-muted">How serious that kind of issue generally is — a fixed property of the issue type itself:</p>
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
              How strongly webioom recommends acting on this specific finding right now, relative to
              everything else in the report.
            </p>
            <p className="mt-3 text-sm text-gray-700">
              Two findings can share the same severity but a different priority. A medium-severity issue
              affecting one rarely-visited page ranks lower than the same kind of issue affecting your
              homepage and a dozen other pages — priority accounts for reach, severity alone doesn&apos;t.
            </p>
          </Card>
        </div>
      </Container>

      {/* 11. AFFECTED PAGES */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading eyebrow="Reading a report" title="Affected pages" />

          <div className="mt-8 grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
            <p className="text-sm leading-relaxed text-gray-700">
              webioom groups repeated findings so you see one entry per issue, not one row per page.
              Each entry shows exactly how many — and which — pages it affects, so you can immediately tell
              whether something is an isolated slip or a pattern worth fixing at the template or theme
              level, instead of page by page.
            </p>

            <Card padding="md" className="max-w-sm">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted" aria-hidden="true" />
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">Example only</p>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-900">Missing image alt text</p>
              <p className="mt-1 text-sm text-muted">4 pages affected</p>
            </Card>
          </div>
        </Container>
      </div>

      {/* 12. RECOMMENDATIONS */}
      <Container size="lg" className="py-16 sm:py-20">
        <SectionHeading
          eyebrow="Reading a report"
          title="webioom doesn't stop at naming a problem"
          description="Every finding in a report includes:"
        />

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Description', description: 'Plain-language context for what was found and why it was flagged.' },
            { title: 'Recommendation', description: 'A specific, actionable suggestion for what to do about it.' },
            { title: 'Affected pages', description: 'Exactly which pages the issue was found on.' },
            { title: 'Action state', description: 'Where supported, whether it’s a Safe, AI-Assisted, or Guided fix.' },
          ].map((item) => (
            <Card key={item.title}>
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
            </Card>
          ))}
        </div>
      </Container>

      {/* 13. REPORT → ACTION CONNECTION */}
      <div className="border-t border-border bg-surface-muted">
        <Container size="md" className="py-16 text-center sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            From a report entry to a resolved issue
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            A report identifies the problem. webioom determines what kind of action is appropriate.
            Supported fixes move through Prepare, Review, Apply, and Verify — everything else stays a clear,
            guided recommendation you can act on yourself.
          </p>
          <div className="mt-6">
            <Link href="/product" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
              See How It Works
            </Link>
          </div>
        </Container>
      </div>
    </>
  )
}
