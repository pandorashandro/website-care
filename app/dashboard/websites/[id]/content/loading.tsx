import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Skeleton from '@/components/ui/skeleton'
import Spinner from '@/components/ui/spinner'

export default function ContentLoading() {
  return (
    <Container size="md" className="py-10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" />
        <span>Loading Content…</span>
      </div>

      <Card padding="md" className="mt-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-1/2" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </Card>

      <div className="mt-4 flex gap-4 border-b border-border">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-32" />
      </div>

      <Card padding="md" className="mt-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-10 w-16" />
      </Card>

      <div className="mt-4 space-y-4">
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
