import { Gauge } from 'lucide-react'
import { renderPillarReportPage } from '../pillar-report'
import { analyzePerformanceCrawlRun } from '../performance-actions'
import { PERFORMANCE_ANALYZER_VERSION } from '@/lib/pillars/types'

export default async function PerformancePage(props: PageProps<'/dashboard/websites/[id]/performance'>) {
  const { id } = await props.params

  return renderPillarReportPage(id, {
    pillar: 'performance',
    analyzerVersion: PERFORMANCE_ANALYZER_VERSION,
    navKey: 'performance',
    label: 'Performance',
    description: 'How quickly and efficiently your pages load, based on directly measured page weight, scripts, and resource loading.',
    icon: Gauge,
    emptyStateDescription: "webioom didn't detect any of the performance conditions it currently checks for.",
    analyzeAction: analyzePerformanceCrawlRun,
  })
}
