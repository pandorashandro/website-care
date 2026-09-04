import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import { getTitleIssueKind, getMetaDescriptionIssueKind } from '@/lib/fixes/fix-preview'
import PrepareFixButton from '@/app/dashboard/websites/[id]/prepare-fix-button'
import ShopifyPrepareFixButton from '@/app/dashboard/websites/[id]/shopify-prepare-fix-button'
import AffectedPages from './affected-pages'
import IssueActionPanel from './issue-action-panel'
import {
  type DecoratedIssue,
  SEVERITY_LABELS,
  severityTone,
  FIXABILITY_LABELS,
  fixabilityTone,
  FIXABILITY_ICON,
  formatPageLabel,
} from './report-helpers'

const PRIORITY_TEXT_CLASS: Record<string, string> = {
  Urgent: 'text-red-700',
  'High Priority': 'text-orange-700',
  'Medium Priority': 'text-amber-700',
  'Low Priority': 'text-muted',
}

export type MissingImageAltInstance = { issueId: string; pageUrl: string; imageUrl: string }

/**
 * One aggregated issue's full card in the Detailed Report. This is the only
 * place PrepareFixButton is rendered, and the exact same two branches used
 * since Phase 18.9 are preserved byte-for-byte: missing image alt text
 * renders one PrepareFixButton per exact affected image (never "the first
 * image"), everything else renders a single button against the issue's
 * first affected page. Neither PrepareFixButton's props nor its own internal
 * workflow logic are touched — only what surrounds it changed.
 *
 * Hierarchy: title -> quick-scan meta (severity/priority/pages/fixability)
 * -> why this matters -> affected pages -> recommended action -> one action
 * panel with the real next step, matching the Phase 18.10 issue hierarchy.
 */
export default function IssueGroup({
  issue,
  websiteId,
  missingImageAltInstances,
}: {
  issue: DecoratedIssue
  websiteId: string
  missingImageAltInstances: MissingImageAltInstance[]
}) {
  const shopifyFixKind = getTitleIssueKind(issue.title) ? 'title' : getMetaDescriptionIssueKind(issue.title) ? 'meta_description' : null

  const fixButtons =
    issue.fixability.level === 'assisted' ? (
      issue.fixProvider === 'shopify' ? (
        issue.shopifyIssueId && issue.affectedPageUrls[0] && shopifyFixKind && (
          <ShopifyPrepareFixButton
            websiteId={websiteId}
            pageLabel={formatPageLabel(issue.affectedPageUrls[0])}
            issueId={issue.shopifyIssueId}
            fixKind={shopifyFixKind}
          />
        )
      ) : issue.title === ISSUE_DEFINITIONS.missing_image_alt.title ? (
        missingImageAltInstances.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Images missing alt text</p>
            {missingImageAltInstances.map((instance, index) => (
              <div key={instance.issueId} className="rounded-md border border-border bg-surface p-2">
                <p className="truncate font-mono text-xs text-muted">
                  {index + 1}. {instance.imageUrl}
                </p>
                <PrepareFixButton
                  websiteId={websiteId}
                  pageUrl={instance.pageUrl}
                  pageLabel={formatPageLabel(instance.pageUrl)}
                  issueTitle={issue.title}
                  issueId={instance.issueId}
                />
              </div>
            ))}
          </div>
        )
      ) : (
        issue.affectedPageUrls[0] && (
          <PrepareFixButton
            websiteId={websiteId}
            pageUrl={issue.affectedPageUrls[0]}
            pageLabel={formatPageLabel(issue.affectedPageUrls[0])}
            issueTitle={issue.title}
          />
        )
      )
    ) : null

  const ActionIcon = FIXABILITY_ICON[issue.fixability.level]

  return (
    <Card id={issue.anchorId} padding="md" className="scroll-mt-20">
      <h3 className="text-base font-semibold text-gray-900">{issue.title}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge tone={severityTone(issue.severity)}>{SEVERITY_LABELS[issue.severity] ?? issue.severity}</Badge>
        <span className={`text-xs font-medium ${PRIORITY_TEXT_CLASS[issue.priorityLabel] ?? 'text-muted'}`}>
          {issue.priorityLabel}
        </span>
        <span className="text-xs text-subtle">
          {issue.affectedPageCount} page{issue.affectedPageCount === 1 ? '' : 's'} affected
        </span>
        {issue.homepageAffected && <Badge tone="info">Homepage</Badge>}
        <Badge tone={fixabilityTone(issue.fixability.level)}>
          <ActionIcon className="mr-1 h-3 w-3" aria-hidden="true" />
          {FIXABILITY_LABELS[issue.fixability.level]}
        </Badge>
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Why this matters</p>
        <p className="mt-1 text-sm text-gray-700">{issue.description}</p>
      </div>

      <AffectedPages pageUrls={issue.affectedPageUrls} />

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Recommended action</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">{issue.recommendation}</p>
      </div>

      <IssueActionPanel fixability={issue.fixability}>{fixButtons}</IssueActionPanel>
    </Card>
  )
}
