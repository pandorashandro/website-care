import { Shield } from 'lucide-react'
import { renderPillarReportPage } from '../pillar-report'
import { analyzeSecurityCrawlRun } from '../security-actions'
import { SECURITY_ANALYZER_VERSION } from '@/lib/pillars/types'

export default async function SecurityPage(props: PageProps<'/dashboard/websites/[id]/security'>) {
  const { id } = await props.params

  return renderPillarReportPage(id, {
    pillar: 'security',
    analyzerVersion: SECURITY_ANALYZER_VERSION,
    navKey: 'security',
    label: 'Security',
    description: 'Publicly observable website security hygiene — HTTPS usage, mixed content, and response headers. This is not a penetration test and does not guarantee your site has no vulnerabilities.',
    icon: Shield,
    emptyStateDescription: "webioom didn't detect any of the security hygiene conditions it currently checks for.",
    analyzeAction: analyzeSecurityCrawlRun,
  })
}
