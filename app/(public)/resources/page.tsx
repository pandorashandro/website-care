import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { RESOURCES, getUsedCategories, getResourcesByCategory, type Resource } from '@/lib/content/resources'

export const metadata: Metadata = {
  title: 'Resources',
  description: 'Practical guides for understanding common website problems, why they matter, and what to do about them.',
}

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link href={`/resources/${resource.slug}`} className="group block h-full">
      <Card className="flex h-full flex-col transition-shadow group-hover:shadow-md">
        <Badge tone="brand">{resource.category}</Badge>
        <h3 className="mt-3 text-base font-semibold text-gray-900">{resource.title}</h3>
        <p className="mt-2 flex-1 text-sm text-muted">{resource.summary}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
          Read more
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Card>
    </Link>
  )
}

export default function ResourcesPage() {
  const featured = RESOURCES.filter((resource) => resource.featured)
  const categories = getUsedCategories()

  return (
    <>
      <div className="border-b border-border bg-surface-muted">
        <Container size="lg" className="py-16 text-center sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-brand">Resources</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Website health, explained clearly.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Practical guides for understanding common website problems, why they matter, and what to do
            about them.
          </p>
        </Container>
      </div>

      {featured.length > 0 && (
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading eyebrow="Start here" title="Featured guides" />

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {featured.map((resource) => (
              <ResourceCard key={resource.slug} resource={resource} />
            ))}
          </div>
        </Container>
      )}

      <div className="border-t border-border bg-surface-muted">
        <Container size="lg" className="py-16 sm:py-20">
          <SectionHeading eyebrow="All guides" title="Browse by category" />

          <div className="mt-10 space-y-14">
            {categories.map((category) => {
              const resources = getResourcesByCategory(category)
              return (
                <div key={category}>
                  <h3 className="text-lg font-semibold text-gray-900">{category}</h3>
                  <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {resources.map((resource) => (
                      <ResourceCard key={resource.slug} resource={resource} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Container>
      </div>
    </>
  )
}
