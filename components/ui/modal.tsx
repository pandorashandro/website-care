'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

/**
 * Shared dialog shell — replaces the fixed-inset backdrop + centered white
 * panel markup that AddWebsiteButton/ConnectWordPressButton previously
 * hand-rolled independently. Closes on Escape and on backdrop click; does
 * not implement a full focus trap (no extra dependency for it), but is
 * otherwise a semantic dialog: role="dialog", aria-modal, and the title is
 * connected via aria-labelledby.
 */
export default function Modal({ open, onClose, title, description, children }: ModalProps) {
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface-muted hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {description && <p className="mt-1 text-sm text-muted">{description}</p>}

        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
