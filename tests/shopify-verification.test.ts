import { describe, it, expect } from 'vitest'
import { isShopifyPasswordOrAccessPage } from '@/lib/fixes/verify-shopify-public-value'

/**
 * Phase 21 — permanent regression coverage for the Shopify storefront
 * password/access-gate detector. This is the one piece of
 * verify-shopify-public-value.ts's logic that is pure, deterministic, and
 * meaningfully security-relevant on its own (misclassifying a password-gate
 * response as the real target page could produce a false 'mismatch' or,
 * worse, a false 'verified'). Exercises the exported pure function directly
 * — no live fetch, no mocking of fetchPage.
 */
describe('isShopifyPasswordOrAccessPage', () => {
  it('detects Shopify\'s reserved /password path', () => {
    expect(isShopifyPasswordOrAccessPage('https://my-store.myshopify.com/password', '<html><body>Enter password</body></html>')).toBe(true)
  })

  it('detects the storefront_password form_type hidden field regardless of path', () => {
    const html = `<html><body><form><input type="hidden" name="form_type" value="storefront_password"></form></body></html>`
    expect(isShopifyPasswordOrAccessPage('https://my-store.myshopify.com/', html)).toBe(true)
  })

  it('detects the hidden field with single quotes and mixed attribute order', () => {
    const html = `<input value='storefront_password' type='hidden' name='form_type'>`
    expect(isShopifyPasswordOrAccessPage('https://my-store.myshopify.com/', html)).toBe(true)
  })

  it('does not flag a normal product page', () => {
    const html = `<html><head><title>Cool Shirt</title></head><body><img src="/shirt.jpg" alt=""></body></html>`
    expect(isShopifyPasswordOrAccessPage('https://my-store.myshopify.com/products/cool-shirt', html)).toBe(false)
  })

  it('does not flag a page merely because it mentions the word "password" in ordinary copy', () => {
    const html = `<html><body><p>Forgot your password? Contact support.</p></body></html>`
    expect(isShopifyPasswordOrAccessPage('https://my-store.myshopify.com/pages/account-help', html)).toBe(false)
  })

  it('does not flag a form_type field with a different value', () => {
    const html = `<input type="hidden" name="form_type" value="customer_login">`
    expect(isShopifyPasswordOrAccessPage('https://my-store.myshopify.com/', html)).toBe(false)
  })

  it('handles a malformed finalUrl without throwing, falling through to the HTML check', () => {
    expect(() => isShopifyPasswordOrAccessPage('not a url', '<html></html>')).not.toThrow()
    expect(isShopifyPasswordOrAccessPage('not a url', '<html></html>')).toBe(false)
  })
})
