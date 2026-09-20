'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsUpDown, Check, Plus, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

export type SwitcherWebsite = { id: string; name: string; url: string }

/**
 * Sprint 3, Prompt 2 — Section 8 fix: "which website am I working on, and
 * how do I switch." Sits at the top of the persistent global sidebar in
 * BOTH the portfolio view and every website workspace, so this question is
 * answerable from anywhere without navigating back to Dashboard first.
 *
 * Derives the current website purely from the URL
 * (`/dashboard/websites/[id]/...`) — never from a second source of truth —
 * so it can never disagree with the page actually being viewed.
 */
export default function WebsiteSwitcher({ websites }: { websites: SwitcherWebsite[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const match = pathname.match(/^\/dashboard\/websites\/([^/]+)/)
  const currentId = match?.[1]
  const current = websites.find((w) => w.id === currentId)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    // Closes the panel after a route change (a website was picked, or the
    // user navigated some other way while it was open). Guarded on `open`
    // itself so this never fires a state update on the common case (every
    // OTHER render where the panel is already closed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setOpen(false)
    // Only `pathname` should re-trigger this close-on-navigate check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div ref={rootRef} className="relative px-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-lg border border-border-dark bg-brand-dark-hover/40 px-2.5 py-2 text-left transition-colors duration-150 ease-out hover:bg-brand-dark-hover"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-dark-hover text-xs font-semibold text-text-on-dark">
          {current ? current.name.slice(0, 1).toUpperCase() : <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-on-dark">{current ? current.name : 'All websites'}</span>
          {current && <span className="block truncate text-xs text-text-on-dark-muted">{formatHost(current.url)}</span>}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-on-dark-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch website"
          className="absolute left-3 right-3 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-border-dark bg-surface-dark py-1.5 shadow-lg motion-safe:animate-[webioom-rise-in_var(--duration-base)_var(--ease-out)_both]"
        >
          <Link
            href="/dashboard"
            role="option"
            aria-selected={!current}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-on-dark-muted hover:bg-brand-dark-hover hover:text-text-on-dark"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            All websites
            {!current && <Check className="ml-auto h-4 w-4 text-brand-vivid" aria-hidden="true" />}
          </Link>

          <div className="my-1.5 border-t border-border-dark" />

          {websites.map((website) => (
            <Link
              key={website.id}
              href={`/dashboard/websites/${website.id}`}
              role="option"
              aria-selected={website.id === currentId}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 text-sm text-text-on-dark-muted hover:bg-brand-dark-hover hover:text-text-on-dark',
                website.id === currentId && 'text-text-on-dark'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-text-on-dark-muted">
                {website.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{website.name}</span>
              {website.id === currentId && <Check className="h-4 w-4 shrink-0 text-brand-vivid" aria-hidden="true" />}
            </Link>
          ))}

          <div className="my-1.5 border-t border-border-dark" />

          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-brand-vivid hover:bg-brand-dark-hover"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add website
          </Link>
        </div>
      )}
    </div>
  )
}

function formatHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
