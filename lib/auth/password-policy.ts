/**
 * Shared password policy for every customer-facing password field
 * (signup, password reset). Kept in one place so the requirement is never
 * silently inconsistent between where a password is first set and where
 * it can later be changed.
 */
export const MIN_PASSWORD_LENGTH = 6

export type PasswordValidationResult = { ok: true } | { ok: false; message: string }

/** Pure, framework-free validation — the actual authority for whether a password is accepted is still Supabase's own auth API; this only gives the user a fast, clear client-side message before that call is made. */
export function validateNewPassword(password: string, confirmPassword: string): PasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  if (password !== confirmPassword) {
    return { ok: false, message: 'Passwords do not match.' }
  }

  return { ok: true }
}
