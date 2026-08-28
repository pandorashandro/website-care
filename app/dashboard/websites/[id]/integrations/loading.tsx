import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import Skeleton from '@/components/ui/skeleton'
import Spinner from '@/components/ui/spinner'

export default function IntegrationsLoading() {
  return (
    <Container size="md" className="py-10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" />
        <span>Loading integrations…</span>
      </div>

      <div className="mt-4 flex gap-4 border-b border-border">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>

      <Card padding="md" className="mt-6">
        <Skeleton className="h-10 w-10 rounded-md" />
        <Skeleton className="mt-4 h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-1 h-3 w-2/3" />
        <Skeleton className="mt-4 h-9 w-40" />
      </Card>
    </Container>
  )
}
