import { RotateCcw } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { formatPageLabel } from '@/components/report/report-helpers'
import type { FixHistoryRecord } from '@/app/dashboard/websites/[id]/fix-history'
import { isRollbackEligibleByShape, isShopifyRollbackEligibleByShape } from '@/app/dashboard/websites/[id]/fix-history'
import UndoFixButton from '@/app/dashboard/websites/[id]/undo-fix-button'
import UndoMetaFixButton from '@/app/dashboard/websites/[id]/undo-meta-fix-button'
import UndoH1FixButton from '@/app/dashboard/websites/[id]/undo-h1-fix-button'
import UndoImageAltFixButton from '@/app/dashboard/websites/[id]/undo-image-alt-fix-button'
import UndoShopifyTitleFixButton from '@/app/dashboard/websites/[id]/undo-shopify-title-fix-button'
import UndoShopifyMetaFixButton from '@/app/dashboard/websites/[id]/undo-shopify-meta-fix-button'
import { getActionLabel, isUndoRow, formatPreviousValue, formatDateTime, formatImageLabel, getVerificationCopy } from './activity-helpers'

const SHOPIFY_RESOURCE_LABELS: Record<string, string> = {
  product: 'Product',
  collection: 'Collection',
  page: 'Page',
  article: 'Article',
}

/**
 * One fix_history row, translated into product language. WordPress rows
 * keep reusing the exact same Undo components and isRollbackEligibleByShape
 * gate this component always used. Shopify rows (platform === 'shopify')
 * are routed to a genuinely separate eligibility check
 * (isShopifyRollbackEligibleByShape) and their own Undo components — the
 * two platforms' resource_type vocabularies collide on the literal string
 * 'page' (a WordPress Page vs. a Shopify Page are unrelated resources), so
 * `platform` is checked FIRST, before any field/resource_type branching,
 * exactly mirroring fix-history.ts's own eligibility functions.
 */
export default function ActivityItem({ fix, websiteId }: { fix: FixHistoryRecord; websiteId: string }) {
  const undo = isUndoRow(fix)
  const verification = getVerificationCopy(fix.verification_status)
  const isShopify = fix.platform === 'shopify'
  const eligible = isShopify ? isShopifyRollbackEligibleByShape(fix) : isRollbackEligibleByShape(fix)

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {undo && <RotateCcw className="h-4 w-4 text-muted" aria-hidden="true" />}
          <h3 className="text-sm font-semibold text-gray-900">{getActionLabel(fix)}</h3>
        </div>
        <Badge tone={verification.tone}>{verification.label}</Badge>
      </div>

      <div className="mt-1.5 space-y-0.5">
        <p className="truncate font-mono text-xs text-muted">Page · {formatPageLabel(fix.page_url)}</p>
        {fix.field === 'image_alt' && fix.image_url && (
          <p className="truncate font-mono text-xs text-muted">Image · {formatImageLabel(fix.image_url)}</p>
        )}
        {isShopify && (
          <p className="truncate font-mono text-xs text-muted">
            Shopify · {(fix.resource_type && SHOPIFY_RESOURCE_LABELS[fix.resource_type]) || 'Resource'}
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">{verification.description}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Previous</p>
          <p className="mt-0.5 text-sm text-gray-700">{formatPreviousValue(fix)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Applied</p>
          <p className="mt-0.5 text-sm text-gray-700">{`"${fix.applied_value}"`}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-subtle">{formatDateTime(fix.created_at)}</p>

      {eligible && isShopify && fix.field === 'title' && (
        <UndoShopifyTitleFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
      {eligible && isShopify && fix.field === 'meta_description' && (
        <UndoShopifyMetaFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
      {eligible && !isShopify && fix.field === 'title' && (
        <UndoFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
      {eligible && !isShopify && fix.field === 'meta_description' && (
        <UndoMetaFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
      {eligible && !isShopify && fix.field === 'h1' && (
        <UndoH1FixButton websiteId={websiteId} fixHistoryId={fix.id} appliedValue={fix.applied_value} />
      )}
      {eligible && !isShopify && fix.field === 'image_alt' && (
        <UndoImageAltFixButton
          websiteId={websiteId}
          fixHistoryId={fix.id}
          previousValue={fix.previous_value ?? ''}
          appliedValue={fix.applied_value}
        />
      )}
    </Card>
  )
}
