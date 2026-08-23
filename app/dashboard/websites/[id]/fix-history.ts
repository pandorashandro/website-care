import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type FixHistoryInsertInput = {
  websiteId: string
  issueTitle: string
  pageUrl: string
  resourceType: 'page' | 'post'
  resourceId: number
  previousValue: string | null
  appliedValue: string
  verificationStatus: string
}

export type FixHistoryInsertResult = 'saved' | 'failed'

/**
 * Records a durable audit row for one already-completed, already-confirmed
 * WordPress title write. This is an internal helper, not a Server Action —
 * it is reachable only from inside applyFix, after ownership, capability,
 * and WordPress response validation have all already passed, so every value
 * here is server-derived rather than accepted fresh from the browser. A
 * failure here never implies (and must never be reported as) the WordPress
 * write having failed — the external change already happened regardless.
 */
export async function recordFixHistory(input: FixHistoryInsertInput): Promise<FixHistoryInsertResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('fix_history').insert({
      website_id: input.websiteId,
      issue_title: input.issueTitle,
      page_url: input.pageUrl,
      platform: 'wordpress',
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      field: 'title',
      previous_value: input.previousValue,
      applied_value: input.appliedValue,
      verification_status: input.verificationStatus,
    })

    return error ? 'failed' : 'saved'
  } catch {
    return 'failed'
  }
}

export type FixHistoryRecord = {
  id: string
  issue_title: string
  page_url: string
  platform: string
  resource_type: string | null
  resource_id: number | null
  field: string
  previous_value: string | null
  applied_value: string
  verification_status: string
  created_at: string
}

const RECENT_FIXES_LIMIT = 10

/**
 * Read-only, for display in the report's "Recent Fixes" section. Selects an
 * explicit column list (never `select('*')`) and relies on the same
 * ownership check the report page itself already performed on `websiteId`
 * before rendering, with RLS as the enforced second layer underneath.
 */
export async function getRecentFixHistory(websiteId: string): Promise<FixHistoryRecord[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fix_history')
    .select(
      'id, issue_title, page_url, platform, resource_type, resource_id, field, previous_value, applied_value, verification_status, created_at'
    )
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(RECENT_FIXES_LIMIT)
    .returns<FixHistoryRecord[]>()

  if (error || !data) return []
  return data
}
