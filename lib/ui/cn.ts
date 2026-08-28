/** Joins conditional class names. No tailwind-merge/clsx dependency — this codebase avoids extra packages where a one-line helper suffices. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
