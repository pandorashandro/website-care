import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Skeleton from '@/components/ui/skeleton'
import Spinner from '@/components/ui/spinner'

/**
 * Sprint 3, Prompt 2B — shared by every pillar report's own `loading.tsx`
 * (Technical SEO, On-Page SEO, Content, Site Architecture, Performance,
 * Accessibility, Security). All seven pages render the exact same
 * structure at `Container size="2xl"` (header card, WebsiteSubNav,
 * PillarSubNav, summary card, finding list) — this mirrors it at the same
 * width so the real content never shifts the page when it arrives, rather
 * than the previous `size="md"` skeletons that were far narrower than the
 * pages they preceded.
 */
export default function PillarLoadingSkeleton({ label }: { label: string }) {
  return (
    <Container size="2xl" className="py-10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" />
        <span>Loading {label}…</span>
      </div>

      <Card padding="md" className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2 h-6 w-1/3" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
        <Skeleton className="h-9 w-full sm:w-56" />
      </Card>

      <div className="mt-4 flex gap-4 border-b border-border pb-px">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-24 rounded-full" />
        ))}
      </div>

      <Card padding="md" className="mt-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-9 w-16" />
        <Skeleton className="mt-3 h-3 w-2/3" />
      </Card>

      <div className="mt-6 space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} padding="md">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-5 w-2/3" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-5/6" />
          </Card>
        ))}
      </div>
    </Container>
  )
}
