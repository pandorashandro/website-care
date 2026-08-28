import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import SectionHeading from '@/components/ui/section-heading'
import { RESOURCES } from '@/lib/content/resources'

export const metadata: Metadata = {
  title: 'Resources',
  description: 'Clear, practical explanations of common website health and SEO issues — and why they matter.',
}

export default function ResourcesPage() {
  return (
    <Container size="lg" className="py-16 sm:py-20">
      <SectionHeading
        eyebrow="Resources"
        title="Understand your website, one issue at a time"
        description="Short, practical explanations of the kinds of problems Website Care looks for — and why they're worth fixing."
      />

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCES.map((resource) => (
          <Link key={resource.slug} href={`/resources/${resource.slug}`} className="group block">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <Badge tone="brand">{resource.category}</Badge>
              <h3 className="mt-3 text-base font-semibold text-gray-900">{resource.title}</h3>
              <p className="mt-2 text-sm text-muted">{resource.summary}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
                Read more
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </Container>
  )
}
