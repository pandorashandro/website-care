import Link from 'next/link'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
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

/**
 * Unified webioom engine, Prompt 3 — Overview's command-center "Fix These
 * First" section. Deliberately a short, deterministic list (never a
 * separate prioritization engine): items are already sorted by
 * severity/affected-page-count in app/.../fix-these-first.ts and simply
 * rendered here, each linking straight to the category page that owns it.
 */
export default function FixTheseFirst({ problems }: { problems: TopProblem[] }) {
  if (problems.length === 0) return null

  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Fix these first</h2>
      <p className="mt-1 text-sm text-muted">
        The highest-priority problems webioom found across your whole website, in order.
      </p>

      <ul className="mt-4 space-y-3">
        {problems.map((problem, index) => (
          <li key={`${problem.categoryKey}-${index}`}>
            <Link
              href={problem.href}
              className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3 hover:border-gray-300 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{problem.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {problem.categoryLabel} · {problem.affectedPageCount} page{problem.affectedPageCount === 1 ? '' : 's'} affected
                </p>
              </div>
              <Badge tone={SEVERITY_TONE[problem.severity]}>{SEVERITY_LABEL[problem.severity]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
