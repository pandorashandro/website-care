/** "1 / 1 websites" / "0 / 3 websites" — the billing page's website-usage line. Pure formatting only; the actual limit enforcement lives entirely in lib/entitlements/. */
export function formatWebsiteUsage(currentCount: number, maxWebsites: number): string {
  const websiteWord = maxWebsites === 1 ? 'website' : 'websites'
  return `${currentCount} / ${maxWebsites} ${websiteWord}`
}
