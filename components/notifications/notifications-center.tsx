'use client'

import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import { Info, CheckCircle2, AlertTriangle, AlertOctagon, CheckCheck, Check } from 'lucide-react'
import { cn } from '@/lib/ui/cn'
import Badge, { type BadgeTone } from '@/components/ui/badge'
import { formatRelativeTime, notificationDateGroup, type NotificationDateGroup } from '@/lib/monitoring/format-relative-time'
import type { CommunicationSeverity } from '@/lib/monitoring/notification-copy'
import type { NotificationRow } from '@/lib/monitoring/notification-service'
import { markAllNotificationsRead, markNotificationRead } from '@/app/dashboard/notifications/actions'

/**
 * Sprint 3 (monitoring + notifications completion) — Section 15's full
 * Notifications Center: every persisted monitoring_events row this user
 * owns, grouped Today/Yesterday/Earlier, with real (not cosmetic)
 * mark-read/mark-all-read behavior — both call the actual server actions
 * in app/dashboard/notifications/actions.ts, which independently verify
 * ownership before writing, exactly like the bell panel this page's data
 * shape is shared with.
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

const SEVERITY_BADGE_TONE: Record<CommunicationSeverity, BadgeTone> = {
  informational: 'info',
  positive: 'success',
  attention: 'warning',
  important: 'danger',
}

const SEVERITY_BADGE_LABEL: Record<CommunicationSeverity, string> = {
  informational: 'Update',
  positive: 'Good news',
  attention: 'Needs attention',
  important: 'Action required',
}

const GROUP_ORDER: NotificationDateGroup[] = ['Today', 'Yesterday', 'Earlier']

function groupNotifications(notifications: NotificationRow[]): Map<NotificationDateGroup, NotificationRow[]> {
  const groups = new Map<NotificationDateGroup, NotificationRow[]>()
  for (const notification of notifications) {
    const group = notificationDateGroup(notification.createdAt)
    const existing = groups.get(group) ?? []
    existing.push(notification)
    groups.set(group, existing)
  }
  return groups
}

export default function NotificationsCenter({ initialNotifications, hasActiveMonitoring }: { initialNotifications: NotificationRow[]; hasActiveMonitoring: boolean }) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const unreadCount = notifications.filter((notification) => !notification.readAt).length

  function handleMarkRead(id: string) {
    setNotifications((rows) => rows.map((row) => (row.id === id && !row.readAt ? { ...row, readAt: new Date().toISOString() } : row)))
    void markNotificationRead(id)
  }

  function handleMarkAllRead() {
    if (unreadCount === 0) return
    const now = new Date().toISOString()
    setNotifications((rows) => rows.map((row) => (row.readAt ? row : { ...row, readAt: now })))
    void markAllNotificationsRead()
  }

  const groups = groupNotifications(notifications)

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">Everything webioom has told you about your websites, in one place.</p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors duration-150 ease-out hover:bg-surface-muted"
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState hasActiveMonitoring={hasActiveMonitoring} />
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.filter((group) => (groups.get(group) ?? []).length > 0).map((group) => (
            <section key={group} aria-label={group}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{group}</h2>
              <ul className="space-y-2">
                {(groups.get(group) ?? []).map((notification) => (
                  <NotificationCard key={notification.id} notification={notification} onMarkRead={() => handleMarkRead(notification.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function NotificationCard({ notification, onMarkRead }: { notification: NotificationRow; onMarkRead: () => void }) {
  const Icon = SEVERITY_ICON[notification.classified.severity]
  const isUnread = !notification.readAt

  return (
    <li className={cn('rounded-lg border border-border bg-white p-4 transition-colors duration-150 ease-out', isUnread && 'border-brand/30 bg-brand-subtle/30')}>
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', SEVERITY_ICON_CLASS[notification.classified.severity])} aria-hidden={true} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_BADGE_TONE[notification.classified.severity]}>{SEVERITY_BADGE_LABEL[notification.classified.severity]}</Badge>
            {isUnread && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-vivid" />}
          </div>
          <p className="mt-1.5 text-sm font-semibold text-gray-900">{notification.classified.headline}</p>
          <p className="mt-0.5 text-sm text-gray-600">{notification.classified.summary}</p>

          {notification.classified.highlights.length > 0 && (
            <ul className="mt-2 space-y-1">
              {notification.classified.highlights.map((line) => (
                <li key={line} className="text-xs text-gray-500">
                  {line}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span>{notification.websiteName}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{formatRelativeTime(notification.createdAt)}</span>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <Link href={`/dashboard/websites/${notification.websiteId}`} className="text-sm font-medium text-brand hover:text-brand-hover">
              View website
            </Link>
            {isUnread && (
              <button type="button" onClick={onMarkRead} className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Mark as read
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function EmptyState({ hasActiveMonitoring }: { hasActiveMonitoring: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white px-6 py-14 text-center">
      {hasActiveMonitoring ? (
        <>
          <p className="text-sm font-medium text-gray-900">All quiet.</p>
          <p className="mt-1 text-sm text-gray-500">webioom hasn&apos;t found anything that needs your attention yet.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-900">Nothing here yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            Automatic monitoring isn&apos;t turned on for any of your websites, so there&apos;s nothing to notify you about yet.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand hover:text-brand-hover">
            Go to your websites
          </Link>
        </>
      )}
    </div>
  )
}
