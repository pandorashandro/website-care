import Link from 'next/link'
import { Wrench, Sparkles, Compass, Code2, Eye } from 'lucide-react'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { cn } from '@/lib/ui/cn'
import type { TopProblem } from '@/app/dashboard/websites/[id]/fix-these-first'

const SEVERITY_TONE: Record<TopProblem['severity'], 'danger' | 'warning' | 'neutral'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

const SEVERITY_LABEL: Record<TopProblem['severity'], string> = {
  critical: 'Critical',
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
}

/** The left-edge accent color per severity — this is what lets a customer scan the whole list by color before reading a single word, rather than only learning priority from a badge at the far right of each row. */
const SEVERITY_EDGE: Record<TopProblem['severity'], string> = {
  critical: 'var(--color-danger)',
  high: 'var(--color-danger)',
  medium: 'var(--color-warning)',
  low: 'var(--color-border-strong)',
}

/**
 * Sprint 3, Prompt 2 — Section 14. The customer-facing action label for
 * each of the five actionability classifications this codebase already
 * makes (lib/fixes/fixability.ts and each engine's own actionability
 * field) — no label here implies a capability the backend doesn't
 * actually support; this is presentation of an existing, already-computed
 * classification, never a new one. "Monitor" findings are informational
 * (webioom already tracks them; there is nothing for the customer to
 * approve), so they get a quieter treatment than the other four.
 */
const ACTION_COPY: Record<TopProblem['actionability'], { label: string; icon: typeof Wrench }> = {
  safe_fix: { label: 'Fix with webioom', icon: Wrench },
  prepared_fix: { label: 'Prepare with AI', icon: Sparkles },
  guided_fix: { label: 'Show me exactly how to fix it', icon: Compass },
  developer_required: { label: 'Developer required', icon: Code2 },
  monitor: { label: 'Monitoring', icon: Eye },
}

/**
 * Unified webioom engine, Prompt 3 — Overview's command-center "Fix These
 * First" section. Deliberately a short, deterministic list (never a
 * separate prioritization engine): items are already sorted by
 * severity/affected-page-count in app/.../fix-these-first.ts and simply
 * rendered here, each linking straight to the category page that owns it.
 *
 * Sprint 3, Prompt 2 — redesigned as a numbered, interpreted priority list
 * (the numbering is real structure here — webioom genuinely decided this
 * order — not decorative "01/02/03" styling) with the actual supported
 * action surfaced per item, per the approved Prompt 1 blueprint.
 */
export default function FixTheseFirst({ problems }: { problems: TopProblem[] }) {
  if (problems.length === 0) return null

  return (
    <Card padding="none" className="overflow-hidden">
      <h2 className="px-5 pt-5 text-base font-semibold text-gray-900">Fix these first</h2>

      <ol className="mt-3 divide-y divide-border">
        {problems.map((problem, index) => {
          const action = ACTION_COPY[problem.actionability]
          const ActionIcon = action.icon
          const isTopPriority = index === 0

          return (
            <li key={`${problem.categoryKey}-${index}`} className="relative">
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: SEVERITY_EDGE[problem.severity] }} aria-hidden="true" />
              <Link
                href={problem.href}
                className="group flex items-center gap-4 py-3.5 pl-5 pr-4 transition-colors duration-150 ease-out hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isTopPriority && <Badge tone="brand">Top priority</Badge>}
                    <p className={cn('truncate text-gray-900', isTopPriority ? 'text-base font-semibold' : 'text-sm font-medium')}>{problem.title}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {problem.categoryLabel} · {problem.affectedPageCount} page{problem.affectedPageCount === 1 ? '' : 's'} affected
                  </p>
                </div>

                <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-gray-700 sm:flex">
                  <ActionIcon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                  {action.label}
                </span>

                <Badge tone={SEVERITY_TONE[problem.severity]} className="shrink-0">
                  {SEVERITY_LABEL[problem.severity]}
                </Badge>
              </Link>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
