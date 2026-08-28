import { formatPageLabel } from './report-helpers'

const ALWAYS_VISIBLE_COUNT = 3

/**
 * Presentation-only — the exact affectedPageUrls list from aggregateIssues,
 * never truncated or altered, just partially revealed. Up to 3 pages show
 * directly; beyond that, a native <details>/<summary> reveals the rest so a
 * 20-page issue doesn't dominate the card. No aggregation/storage change.
 */
export default function AffectedPages({ pageUrls }: { pageUrls: string[] }) {
  if (pageUrls.length === 0) return null

  const heading = pageUrls.length === 1 ? 'Affected page' : 'Affected pages'
  const visible = pageUrls.slice(0, ALWAYS_VISIBLE_COUNT)
  const remaining = pageUrls.slice(ALWAYS_VISIBLE_COUNT)

  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {heading} · {pageUrls.length}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {visible.map((pageUrl) => (
          <li key={pageUrl} className="truncate font-mono text-xs text-muted">
            {formatPageLabel(pageUrl)}
          </li>
        ))}
      </ul>

      {remaining.length > 0 && (
        <details className="group mt-1">
          <summary className="cursor-pointer text-xs font-medium text-brand hover:text-brand-hover marker:content-none">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
                ›
              </span>
              Show {remaining.length} more
            </span>
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {remaining.map((pageUrl) => (
              <li key={pageUrl} className="truncate font-mono text-xs text-muted">
                {formatPageLabel(pageUrl)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
