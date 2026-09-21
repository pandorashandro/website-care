import Image from 'next/image'
import { cn } from '@/lib/ui/cn'

export type LogoProps = {
  /**
   * Controls the rendered height; width follows automatically to preserve
   * the source aspect ratio. Sprint 3, Prompt 2B — the founder's explicit
   * feedback was that the wordmark read as a tiny utility icon throughout
   * the product; every call site now passes a deliberately larger,
   * context-appropriate size (see components/site/public-header.tsx,
   * components/site/public-footer.tsx, and app/dashboard/layout.tsx for the
   * actual values chosen per context) rather than relying on this default.
   */
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

  return <Image src={src} alt="webioom" width={LOGO_WIDTH} height={LOGO_HEIGHT} priority className={cn('h-8 w-auto', className)} />
}
