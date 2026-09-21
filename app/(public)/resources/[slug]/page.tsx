import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ArrowRight, Sparkles } from 'lucide-react'
import Container from '@/components/ui/container'
import Section from '@/components/ui/section'
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
    return <h2 className="mt-10 text-xl font-semibold tracking-tight text-gray-900">{block.text}</h2>
  }

  if (block.type === 'list') {
    return (
      <ul className="mt-4 space-y-2.5">
        {block.items.map((item) => (
          <li key={item} className="flex gap-2.5 text-base leading-relaxed text-gray-700">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-subtle" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    )
  }

  if (block.type === 'callout') {
    return (
      <div className="my-7 rounded-md border-l-4 border-brand bg-brand-subtle px-4 py-3.5">
        <p className="text-sm leading-relaxed text-gray-800">{block.text}</p>
      </div>
    )
  }

  return <p className="mt-4 text-base leading-relaxed text-gray-700">{block.text}</p>
}

/**
 * Sprint 3, Prompt 2B (closed public batch) — a real editorial header
 * (tinted band, breadcrumb, category, title, intro) separated from the
 * reading column below it, instead of everything sitting in one flat
 * white container. Readability rules dark mode out here per this batch's
 * own "readability first" instruction — a tinted, not dark, header keeps
 * the hierarchy real without introducing a dark→light contrast jump right
 * before the body text a visitor is about to read closely.
 */
export default async function ResourceArticlePage(props: PageProps<'/resources/[slug]'>) {
  const { slug } = await props.params
  const resource = getResourceBySlug(slug)

  if (!resource) {
    notFound()
  }

  const related = getRelatedResources(slug)

  return (
    <>
      <Section tint="muted" border="bottom" size="md">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
          <Link href="/resources" className="rounded-sm hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
            Resources
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span aria-current="page" className="truncate text-subtle">
            {resource.title}
          </span>
        </nav>

        <Badge tone="brand" className="mt-5">
          {resource.category}
        </Badge>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">{resource.title}</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">{resource.intro}</p>
      </Section>

      <Container size="sm" className="py-14 sm:py-16">
        <article>
          {resource.body.map((block, index) => (
            <ArticleBlock key={index} block={block} />
          ))}
        </article>

        <div className="relative mt-10 overflow-hidden rounded-lg border border-border bg-surface-muted">
          <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: 'var(--color-brand-vivid)' }} aria-hidden="true" />
          <div className="p-5 pl-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">How webioom handles this</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{resource.productConnection}</p>
          </div>
        </div>

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
                <Link
                  key={item.slug}
                  href={`/resources/${item.slug}`}
                  className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <Card className="h-full motion-hover-lift transition-shadow group-hover:shadow-md" padding="sm">
                    <Badge tone="neutral">{item.category}</Badge>
                    <p className="mt-2 text-sm font-medium text-gray-900">{item.title}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Container>
    </>
  )
}
