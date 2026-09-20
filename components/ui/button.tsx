import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/ui/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** `motion-safe:` is Tailwind's own prefers-reduced-motion guard (no motion at all unless the visitor allows it) — the hover/active translate is the one restrained "premium feel" touch every button gets for free. */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[color,background-color,border-color,transform,box-shadow] duration-150 ease-out motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-foreground hover:bg-brand-hover',
  secondary: 'bg-brand-dark text-text-on-dark hover:bg-brand-dark-hover',
  outline: 'border border-border bg-surface text-gray-700 hover:bg-surface-muted',
  ghost: 'text-gray-600 hover:bg-surface-muted hover:text-gray-900',
  danger: 'bg-danger text-white hover:bg-red-700',
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

/**
 * Shared class builder so non-<button> elements (most commonly a Next.js
 * <Link> used as a CTA) can render with identical styling to <Button> —
 * there is no Radix Slot/asChild dependency in this codebase, so this is
 * the lightweight equivalent.
 */
export function buttonStyles(options?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }): string {
  const variant = options?.variant ?? 'primary'
  const size = options?.size ?? 'md'
  return cn(BASE, VARIANT_STYLES[variant], SIZE_STYLES[size], options?.className)
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export default function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return <button className={buttonStyles({ variant, size, className })} {...props} />
}
