export type CheckoutFailureReason = 'not_authenticated' | 'invalid_plan' | 'plan_not_configured' | 'not_an_upgrade' | 'provider_error'
export type PortalFailureReason = 'not_authenticated' | 'no_paid_customer' | 'provider_error'

/** User-safe copy for a failed checkout attempt — never a raw Paddle error or status code. */
export function getCheckoutErrorMessage(reason: CheckoutFailureReason): string {
  switch (reason) {
    case 'not_authenticated':
      return 'Please log in to upgrade your plan.'
    case 'invalid_plan':
      return 'That plan isn’t available for checkout.'
    case 'plan_not_configured':
      return 'Checkout isn’t available for this plan right now. Please try again shortly.'
    case 'not_an_upgrade':
      return 'You already have this plan or a higher one.'
    case 'provider_error':
    default:
      return 'We couldn’t start checkout right now. Please try again in a moment.'
  }
}

/** User-safe copy for a failed customer-portal request. */
export function getPortalErrorMessage(reason: PortalFailureReason): string {
  switch (reason) {
    case 'not_authenticated':
      return 'Please log in to manage billing.'
    case 'no_paid_customer':
      return 'There’s no billing account to manage yet.'
    case 'provider_error':
    default:
      return 'We couldn’t open billing management right now. Please try again in a moment.'
  }
}
