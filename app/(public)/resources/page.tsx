import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Section from '@/components/ui/section'
import ScrollReveal from '@/components/ui/scroll-reveal'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { RESOURCES, getUsedCategories, getResourcesByCategory, type Resource } from '@/lib/content/resources'

export const metadata: Metadata = {
  title: 'Resources',
  description: 'Practical guides for understanding common website problems, why they matter, and what to do about them.',
}

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link
      href={`/resources/${resource.slug}`}
      className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Card className="flex h-full flex-col motion-hover-lift transition-shadow group-hover:shadow-md">
        <Badge tone="brand">{resource.category}</Badge>
        <h3 className="mt-3 text-base font-semibold text-gray-900">{resource.title}</h3>
        <p className="mt-2 flex-1 text-sm text-muted">{resource.summary}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
          Read more
          <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Card>
    </Link>
  )
}

/** A single compact row (title + one-line summary + arrow) — deliberately NOT another full card, so "Browse by category" reads as a different, denser experience than the featured card grid above it. */
function ResourceRow({ resource }: { resource: Resource }) {
  return (
    <Link
      href={`/resources/${resource.slug}`}
      className="group flex items-center justify-between gap-4 rounded-lg px-3 py-3.5 transition-colors duration-150 ease-out hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{resource.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{resource.summary}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden="true" />
    </Link>
  )
}

export default function ResourcesPage() {
  const featured = RESOURCES.filter((resource) => resource.featured)
  const [primaryFeatured, ...restFeatured] = featured
  const categories = getUsedCategories()

  return (
    <>
      <Section tint="muted" border="bottom" size="lg" containerClassName="text-center">
        <p className="text-sm font-semibold tracking-wide text-brand">Resources</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Website health, explained clearly.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Practical guides for understanding common website problems, why they matter, and what to do about them.
        </p>
      </Section>

      {primaryFeatured && (
        <Section>
          <ScrollReveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-subtle">Start here</p>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* The single most important guide, given real editorial weight instead of sitting as one card among equals. */}
              <Link
                href={`/resources/${primaryFeatured.slug}`}
                className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 lg:col-span-2"
              >
                <Card padding="none" className="h-full overflow-hidden motion-hover-lift">
                  <div className="h-1.5 w-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />
                  <div className="p-8">
                    <Badge tone="brand">{primaryFeatured.category}</Badge>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{primaryFeatured.title}</h2>
                    <p className="mt-3 max-w-lg text-base text-muted">{primaryFeatured.summary}</p>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                      Read the guide
                      <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                </Card>
              </Link>

              <div className="flex flex-col gap-5">
                {restFeatured.slice(0, 2).map((resource) => (
                  <ResourceCard key={resource.slug} resource={resource} />
                ))}
              </div>
            </div>
          </ScrollReveal>
        </Section>
      )}

      <Section tint="muted" border="top">
        <ScrollReveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-subtle">All guides</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">Browse by category</h2>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {categories.map((category) => {
              const resources = getResourcesByCategory(category)
              return (
                <Card key={category} padding="sm">
                  <h3 className="px-3 pt-1 text-sm font-semibold uppercase tracking-wide text-subtle">{category}</h3>
                  <div className="mt-1 divide-y divide-border">
                    {resources.map((resource) => (
                      <ResourceRow key={resource.slug} resource={resource} />
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        </ScrollReveal>
      </Section>
    </>
  )
}
