'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { Bell, Info, CheckCircle2, AlertTriangle, AlertOctagon, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/ui/cn'
import { formatRelativeTime } from '@/lib/monitoring/format-relative-time'
import type { CommunicationSeverity } from '@/lib/monitoring/notification-copy'
import type { NotificationRow } from '@/lib/monitoring/notification-service'
import { markAllNotificationsRead, markNotificationRead } from '@/app/dashboard/notifications/actions'

/**
 * Sprint 3 (monitoring + notifications completion) — the persistent global
 * notification entry point (Sections 13/14 of this sprint's brief). Same
 * handwritten dropdown shape as components/dashboard/website-switcher.tsx
 * (local `open` state + outside-click/Escape listeners + a
 * `motion-safe`-gated entrance animation, no external dependency) — the one
 * established pattern for a dropdown in this codebase.
 *
 * Seeded with server-fetched data (initialNotifications/initialUnreadCount)
 * and updates its OWN local state optimistically after a real, persisted
 * mark-read action — never fabricates read/unread state on its own, and
 * every mark-read click still calls the real server action (see
 * app/dashboard/notifications/actions.ts) so a page reload always agrees
 * with what the bell showed.
 */

const SEVERITY_ICON: Record<CommunicationSeverity, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  informational: Info,
  positive: CheckCircle2,
  attention: AlertTriangle,
  important: AlertOctagon,
}

const SEVERITY_ICON_CLASS: Record<CommunicationSeverity, string> = {
  informational: 'text-info',
  positive: 'text-success',
  attention: 'text-warning',
  important: 'text-danger',
}

export default function NotificationBell({
  initialNotifications,
  initialUnreadCount,
  hasActiveMonitoring,
}: {
  initialNotifications: NotificationRow[]
  initialUnreadCount: number
  /** Section 17: the empty state must never imply automatic monitoring is running for a customer it genuinely isn't running for. */
  hasActiveMonitoring: boolean
}) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const rootRef = useRef<HTMLDivElement>(null)

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

  function handleItemClick(notification: NotificationRow) {
    if (notification.readAt) return
    setNotifications((rows) => rows.map((row) => (row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row)))
    setUnreadCount((count) => Math.max(0, count - 1))
    void markNotificationRead(notification.id)
  }

  function handleMarkAllRead() {
    if (unreadCount === 0) return
    const now = new Date().toISOString()
    setNotifications((rows) => rows.map((row) => (row.readAt ? row : { ...row, readAt: now })))
    setUnreadCount(0)
    void markAllNotificationsRead()
  }

  const recent = notifications.slice(0, 8)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-white shadow-lg motion-safe:animate-[webioom-rise-in_var(--duration-base)_var(--ease-out)_both]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">
                {hasActiveMonitoring
                  ? "All quiet. webioom hasn't found anything that needs your attention."
                  : "Nothing here yet — automatic monitoring isn't turned on for any of your websites."}
              </p>
            ) : (
              <ul>
                {recent.map((notification) => {
                  const Icon = SEVERITY_ICON[notification.classified.severity]
                  return (
                    <li key={notification.id}>
                      <Link
                        href={`/dashboard/websites/${notification.websiteId}`}
                        onClick={() => handleItemClick(notification)}
                        aria-label={`${notification.classified.headline}, ${notification.websiteName}, ${notification.readAt ? 'read' : 'unread'}`}
                        className={cn(
                          'flex items-start gap-3 border-b border-border px-4 py-3 transition-colors duration-150 ease-out last:border-b-0 hover:bg-surface-muted',
                          !notification.readAt && 'bg-brand-subtle/40'
                        )}
                      >
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', SEVERITY_ICON_CLASS[notification.classified.severity])} aria-hidden={true} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900">{notification.classified.headline}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {notification.websiteName} · {formatRelativeTime(notification.createdAt)}
                          </span>
                        </span>
                        {!notification.readAt && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-vivid" />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-brand hover:bg-surface-muted hover:text-brand-hover"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
