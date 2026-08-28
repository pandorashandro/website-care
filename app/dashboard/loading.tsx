import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Skeleton from '@/components/ui/skeleton'
import Spinner from '@/components/ui/spinner'

export default function DashboardLoading() {
  return (
    <Container size="lg" className="py-10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" />
        <span>Loading your websites…</span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} padding="sm">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-6 w-10" />
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} padding="md">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
            <Skeleton className="mt-4 h-5 w-24" />
            <Skeleton className="mt-4 h-9 w-full" />
          </Card>
        ))}
      </div>
    </Container>
  )
}
