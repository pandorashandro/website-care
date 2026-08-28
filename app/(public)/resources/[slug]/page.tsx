import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ArrowRight, Sparkles } from 'lucide-react'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { buttonStyles } from '@/components/ui/button'
import { RESOURCES, getResourceBySlug, getRelatedResources, type ResourceBlock } from '@/lib/content/resources'

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

function ArticleBlock({ block }: { block: ResourceBlock }) {
  if (block.type === 'heading') {
    return <h2 className="mt-8 text-xl font-semibold tracking-tight text-gray-900">{block.text}</h2>
  }

  if (block.type === 'list') {
    return (
      <ul className="mt-4 space-y-2">
        {block.items.map((item) => (
          <li key={item} className="flex gap-2 text-base leading-relaxed text-gray-700">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-subtle" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    )
  }

  if (block.type === 'callout') {
    return (
      <div className="my-6 rounded-md border-l-4 border-brand bg-brand-subtle px-4 py-3">
        <p className="text-sm leading-relaxed text-gray-800">{block.text}</p>
      </div>
    )
  }

  return <p className="mt-4 text-base leading-relaxed text-gray-700">{block.text}</p>
}

export default async function ResourceArticlePage(props: PageProps<'/resources/[slug]'>) {
  const { slug } = await props.params
  const resource = getResourceBySlug(slug)

  if (!resource) {
    notFound()
  }

  const related = getRelatedResources(slug)

  return (
    <Container size="sm" className="py-16 sm:py-20">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
        <Link href="/resources" className="hover:text-gray-900">
          Resources
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span aria-current="page" className="truncate text-subtle">
          {resource.title}
        </span>
      </nav>

      <Badge tone="brand" className="mt-4">
        {resource.category}
      </Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">{resource.title}</h1>
      <p className="mt-4 text-lg text-muted">{resource.intro}</p>

      <article className="mt-2">
        {resource.body.map((block, index) => (
          <ArticleBlock key={index} block={block} />
        ))}
      </article>

      <Card className="mt-10 bg-surface-muted">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">How Website Care handles this</p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{resource.productConnection}</p>
      </Card>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-border pt-8">
        <Link href={resource.ctaHref} className={buttonStyles({ variant: 'primary' })}>
          {resource.ctaLabel}
        </Link>
        <Link href="/resources" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover">
          <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
          Back to Resources
        </Link>
      </div>

      {related.length > 0 && (
        <div className="mt-14 border-t border-border pt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Continue learning</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {related.map((item) => (
              <Link key={item.slug} href={`/resources/${item.slug}`} className="group block">
                <Card className="h-full transition-shadow group-hover:shadow-md" padding="sm">
                  <Badge tone="neutral">{item.category}</Badge>
                  <p className="mt-2 text-sm font-medium text-gray-900">{item.title}</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Container>
  )
}
