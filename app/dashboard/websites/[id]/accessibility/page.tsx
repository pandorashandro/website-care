import { Accessibility } from 'lucide-react'
import { renderPillarReportPage } from '../pillar-report'
import { analyzeAccessibilityCrawlRun } from '../accessibility-actions'
import { ACCESSIBILITY_ANALYZER_VERSION } from '@/lib/pillars/types'

export default async function AccessibilityPage(props: PageProps<'/dashboard/websites/[id]/accessibility'>) {
  const { id } = await props.params

  return renderPillarReportPage(id, {
    pillar: 'accessibility',
    analyzerVersion: ACCESSIBILITY_ANALYZER_VERSION,
    navKey: 'accessibility',
    label: 'Accessibility',
    description: 'Deterministic, static-markup accessibility checks — missing alt text, unlabeled forms, and similar. Keyboard navigation, contrast, and screen-reader usability need manual testing (see the notice below).',
    icon: Accessibility,
    emptyStateDescription: "webioom didn't detect any of the accessibility conditions it currently checks for.",
    analyzeAction: analyzeAccessibilityCrawlRun,
  })
}
