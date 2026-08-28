import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Skeleton from '@/components/ui/skeleton'
import Spinner from '@/components/ui/spinner'

export default function ActivityLoading() {
  return (
    <Container size="md" className="py-10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" />
        <span>Loading activity…</span>
      </div>

      <div className="mt-4 flex gap-4 border-b border-border">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>

      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} padding="md">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-2 h-3 w-1/4" />
            <Skeleton className="mt-4 h-12 w-full" />
          </Card>
        ))}
      </div>
    </Container>
  )
}
