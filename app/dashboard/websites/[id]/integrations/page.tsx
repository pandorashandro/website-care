import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Hand, Lock, ShieldCheck, Puzzle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { detectWordPress } from '@/lib/integrations/wordpress/detect-wordpress'
import { getWordPressConnectionSummary } from '../wordpress-capabilities'
import Container from '@/components/ui/container'
import Card from '@/components/ui/card'
import WebsiteSubNav from '@/components/website/website-sub-nav'
import IntegrationList from '@/components/integrations/integration-list'

type Website = {
  id: string
  name: string
  url: string
}

const TRUST_POINTS = [
  { icon: Hand, text: 'Nothing changes automatically — supported fixes still require your review and approval.' },
  { icon: Lock, text: 'Credentials are handled server-side and are never displayed back to you.' },
  { icon: ShieldCheck, text: 'webioom re-checks the target and your permissions before every supported write.' },
]

export default async function WebsiteIntegrationsPage(props: PageProps<'/dashboard/websites/[id]/integrations'>) {
  const { id } = await props.params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Same ownership pattern as the website overview page — a website row is
  // only ever returned when it belongs to the authenticated user.
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

  // getWordPressConnectionSummary independently re-verifies session +
  // ownership itself — it never trusts this page's earlier check.
  const [wordpress, wordpressConnection] = await Promise.all([
    detectWordPress(website.url),
    getWordPressConnectionSummary(website.id),
  ])

  return (
    <Container size="md" className="py-10">
      <Link href={`/dashboard/websites/${website.id}`} className="text-sm text-muted hover:text-gray-700">
        ← Back to {website.name}
      </Link>

      <WebsiteSubNav websiteId={website.id} active="integrations" />

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{website.url}</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Integrations</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Connect supported platforms to let webioom prepare and apply supported changes after your
          review. Scanning and reporting work without an integration.
        </p>
      </div>

      <div className="mt-6">
        <IntegrationList websiteId={website.id} wordpress={wordpress} wordpressConnection={wordpressConnection} />
      </div>

      <Card padding="md" className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">How this stays safe</h2>
        <div className="mt-3 space-y-3">
          {TRUST_POINTS.map((point) => {
            const Icon = point.icon
            return (
              <div key={point.text} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <p className="text-sm text-gray-700">{point.text}</p>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="mt-6 flex items-start gap-3 rounded-md border border-dashed border-border-strong p-4">
        <Puzzle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-sm text-muted">More integrations are planned.</p>
      </div>
    </Container>
  )
}
