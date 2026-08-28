import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import Container from '@/components/ui/container'
import Badge from '@/components/ui/badge'
import { buttonStyles } from '@/components/ui/button'
import { RESOURCES, getResourceBySlug } from '@/lib/content/resources'

export function generateStaticParams() {
  return RESOURCES.map((resource) => ({ slug: resource.slug }))
}

export async function generateMetadata(props: PageProps<'/resources/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const resource = getResourceBySlug(slug)

  if (!resource) return {}

  return {
    title: resource.title,
    description: resource.summary,
  }
}

export default async function ResourceArticlePage(props: PageProps<'/resources/[slug]'>) {
  const { slug } = await props.params
  const resource = getResourceBySlug(slug)

  if (!resource) {
    notFound()
  }

  return (
    <Container size="sm" className="py-16 sm:py-20">
      <Badge tone="brand">{resource.category}</Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">{resource.title}</h1>

      <div className="prose-none mt-8 space-y-5">
        {resource.body.map((paragraph, index) => (
          <p key={index} className="text-base leading-relaxed text-gray-700">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-border pt-8">
        <Link href={resource.ctaHref} className={buttonStyles({ variant: 'primary' })}>
          {resource.ctaLabel}
        </Link>
        <Link href="/resources" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover">
          <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
          Back to Resources
        </Link>
      </div>
    </Container>
  )
}
