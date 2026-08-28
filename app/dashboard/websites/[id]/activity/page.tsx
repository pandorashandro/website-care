import Link from 'next/link'
import { notFound } from 'next/navigation'
import { History, ClipboardList, CheckCircle2, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getRecentFixHistory } from '../fix-history'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import ActivityItem from '@/components/activity/activity-item'
import { isUndoRow } from '@/components/activity/activity-helpers'

type Website = {
  id: string
  name: string
  url: string
}

const ACTIVITY_LIMIT = 100

export default async function WebsiteActivityPage(props: PageProps<'/dashboard/websites/[id]/activity'>) {
  const { id } = await props.params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Same ownership pattern as the website overview and integrations pages —
  // a website row is only ever returned when it belongs to the
  // authenticated user.
  const { data: website, error: websiteError } = await supabase
    .from('websites')
    .select('id, name, url')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
    .returns<Website>()

  if (websiteError || !website) {
    notFound()
  }

  // getRecentFixHistory scopes strictly to this website_id — a row from a
  // different website can never be returned, RLS is a second layer
  // underneath. No pagination yet: 100 comfortably covers current usage
  // without building filtering/pagination infrastructure prematurely.
  const fixes = await getRecentFixHistory(website.id, ACTIVITY_LIMIT)

  const verifiedCount = fixes.filter((fix) => fix.verification_status === 'verified').length
  const undoCount = fixes.filter((fix) => isUndoRow(fix)).length

  return (
    <Container size="md" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <WebsiteSubNav websiteId={website.id} active="activity" />

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{website.url}</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Activity</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Changes Website Care has applied to this website. Review supported fixes, verification results,
          and Undo availability.
        </p>
      </div>

      {fixes.length === 0 ? (
        <EmptyState
          icon={History}
          title="No changes recorded yet"
          description="Supported fixes that Website Care applies will appear here."
          action={
            <Link href={`/dashboard/websites/${website.id}`} className={buttonStyles({ variant: 'outline' })}>
              Back to Website Overview
            </Link>
          }
          className="mt-6"
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <Card padding="sm">
              <div className="flex items-center gap-2 text-muted">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">Recorded changes</span>
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-gray-900">{fixes.length}</p>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-2 text-muted">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">Verified</span>
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-gray-900">{verifiedCount}</p>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-2 text-muted">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">Undo actions</span>
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-gray-900">{undoCount}</p>
            </Card>
          </div>

          <p className="mt-6 text-xs text-subtle">
            Undo is only performed when Website Care can safely confirm the current website state.
          </p>

          <div className="mt-3 space-y-3">
            {fixes.map((fix) => (
              <ActivityItem key={fix.id} fix={fix} websiteId={website.id} />
            ))}
          </div>
        </>
      )}
    </Container>
  )
}
