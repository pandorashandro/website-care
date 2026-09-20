import Image from 'next/image'
import { cn } from '@/lib/ui/cn'

export type LogoProps = {
  /** Controls the rendered height; width follows automatically to preserve the source aspect ratio. Defaults to a compact size — pass a taller value (e.g. 'h-10') at call sites that want the logo more prominent. */
  className?: string
  /** 'light' (default) renders the on-light wordmark (dark glyph), for white/light surfaces. 'dark' renders the on-dark wordmark (white glyph), for the webioom navy (sidebar, dark footer/hero, pre-launch splash). */
  variant?: 'light' | 'dark'
}

const LOGO_WIDTH = 2172
const LOGO_HEIGHT = 724

/**
 * Sprint 3, Prompt 2 — brand asset normalization. The two approved webioom
 * wordmark files, copied byte-for-byte (no re-encoding, no recoloring) from
 * brand-reference/ into public/brand/ under names that describe their
 * ACTUAL use, not the misleading source filenames:
 *   - webioom-logo-dark.png.png (dark glyph)  -> public/brand/webioom-logo-on-light.png
 *   - webioom-logo-light.png.png (white glyph) -> public/brand/webioom-logo-on-dark.png
 * (Sprint 3 Prompt 1's audit confirmed this mapping by decoding the actual
 * pixel content — the supplied filenames name the wordmark's own color,
 * not the background it's meant for, and are easy to invert by mistake.)
 *
 * Both files are true RGBA PNGs (verified: PNG color-type 6, real alpha
 * channel) — unlike the old brand-reference/webioom-logo1.png (removed;
 * baked-in solid white background), so no white-card wrapper is needed on
 * dark surfaces anymore. This is the actual supplied artwork in both
 * cases, rendered directly via next/image — never recreated, redrawn, or
 * recolored.
 */
export default function Logo({ className, variant = 'light' }: LogoProps) {
  const src = variant === 'dark' ? '/brand/webioom-logo-on-dark.png' : '/brand/webioom-logo-on-light.png'

  return <Image src={src} alt="Webioom" width={LOGO_WIDTH} height={LOGO_HEIGHT} priority className={cn('h-7 w-auto', className)} />
}
