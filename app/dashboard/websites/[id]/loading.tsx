import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Skeleton from '@/components/ui/skeleton'
import Spinner from '@/components/ui/spinner'

export default function WebsiteOverviewLoading() {
  return (
    <Container size="md" className="py-10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" />
        <span>Loading website…</span>
      </div>

      <Card padding="md" className="mt-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-6 w-1/2" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </Card>

      <div className="mt-4 flex gap-4 border-b border-border">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>

      <Card padding="md" className="mt-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-10 w-24" />
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} padding="sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-5 w-12" />
            <Skeleton className="mt-2 h-1.5 w-full" />
          </Card>
        ))}
      </div>
    </Container>
  )
}
