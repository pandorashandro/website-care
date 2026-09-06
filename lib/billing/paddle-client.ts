'use client'

/**
 * Phase 23.3 — the browser-only Paddle.js loader. No npm dependency is
 * added for this: Paddle's own docs require Paddle.js to be loaded
 * directly from `https://cdn.paddle.com/` ("for security and compliance
 * ... to ensure you're running with the latest security and feature
 * updates"), so a bundled/vendored copy would actually work against that
 * requirement, not just be unnecessary. This is a small, hand-written
 * script-injection-with-Promise wrapper rather than `next/script`,
 * specifically because the checkout flow needs to `await` "Paddle.js is
 * loaded and initialized" at the moment a user clicks Upgrade — a fire-
 * and-forget `next/script` load has no equivalent await point.
 *
 * Only `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` is ever read here — this file is
 * imported only from client components, and the token is the one Paddle
 * credential explicitly meant to be public (see docs/paddle-billing.md).
 * `PADDLE_API_KEY`/`PADDLE_WEBHOOK_SECRET` have no NEXT_PUBLIC_ prefix and
 * are never read from client code anywhere in this codebase.
 */
const PADDLE_JS_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js'

export type PaddleCheckoutEvent = { name: string; data?: unknown }

type PaddleGlobal = {
  Initialize: (options: { token: string; eventCallback?: (event: PaddleCheckoutEvent) => void }) => void
  Checkout: {
    open: (options: { transactionId: string }) => void
  }
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal
  }
}

let loadPromise: Promise<PaddleGlobal> | null = null

/**
 * Loads Paddle.js (once — subsequent calls reuse the same in-flight or
 * completed load) and initializes it with the public client-side token.
 * Paddle.js itself infers sandbox vs. production from the token's own
 * prefix (`test_`/`live_`) — no separate environment flag is passed here,
 * matching Paddle's own documented behavior and avoiding a second
 * environment setting that could drift out of sync with the token in use.
 */
export function loadPaddle(clientToken: string, eventCallback: (event: PaddleCheckoutEvent) => void): Promise<PaddleGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Paddle.js can only be loaded in the browser.'))
  }

  if (window.Paddle) {
    return Promise.resolve(window.Paddle)
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise<PaddleGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_JS_SRC}"]`)

    function onLoaded() {
      if (!window.Paddle) {
        reject(new Error('Paddle.js loaded but did not attach window.Paddle.'))
        return
      }
      window.Paddle.Initialize({ token: clientToken, eventCallback })
      resolve(window.Paddle)
    }

    if (existing) {
      existing.addEventListener('load', onLoaded, { once: true })
      existing.addEventListener('error', () => reject(new Error('Paddle.js failed to load.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = PADDLE_JS_SRC
    script.async = true
    script.addEventListener('load', onLoaded, { once: true })
    script.addEventListener('error', () => reject(new Error('Paddle.js failed to load.')), { once: true })
    document.head.appendChild(script)
  }).catch((error) => {
    // A failed load must not be cached — let the next attempt (e.g. a
    // retry click) try loading again instead of permanently failing.
    loadPromise = null
    throw error
  })

  return loadPromise
}
