/**
 * Whether the "Manage billing" control should be shown at all. `customerId`
 * must always be the value already read from THIS user's own
 * `subscriptions.provider_customer_id` (server-side, session-scoped by
 * RLS) — never a value supplied by the browser. A free user (or a paid
 * user whose first webhook hasn't landed yet) has no stored customer id
 * and is correctly ineligible; there is nothing to "manage" yet.
 */
export function hasStoredPaddleCustomer(customerId: string | null): boolean {
  return typeof customerId === 'string' && customerId.length > 0
}
