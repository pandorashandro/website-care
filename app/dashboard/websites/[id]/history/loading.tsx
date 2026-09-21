import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Skeleton from '@/components/ui/skeleton'
import Spinner from '@/components/ui/spinner'

export default function HistoryLoading() {
  return (
    <Container size="xl" className="py-10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" />
        <span>Loading scan history…</span>
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-6 w-40" />
        </div>
      </div>

      <Card padding="none" className="mt-6 overflow-hidden">
        <div className="border-b border-border bg-surface-muted px-4 py-3">
          <Skeleton className="h-3 w-full max-w-3xl" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-6 border-b border-border px-4 py-3.5 last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </Card>
    </Container>
  )
}
