import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import type { CapabilityValue, WordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'

export type FixabilityLevel = 'assisted' | 'manual' | 'unavailable'

/**
 * 'edit_content' means "canEditPages OR canEditPosts" — Phase 14.1 does not
 * yet map an issue's affected page to a specific WordPress content type
 * (post vs. page), so checks that would eventually target either one are
 * conservatively gated on having *some* relevant edit capability, per the
 * spec's explicit instruction not to do content-type mapping yet.
 */
export type RequiredWordPressCapability = 'edit_content' | 'upload_media'

export type FixabilityResult = {
  level: FixabilityLevel
  reason: string
  requiredCapability?: RequiredWordPressCapability
  requiresWordPress: boolean
}

export type FixabilityContext = {
  /** The issue's title, as stored on the issues row — the closest thing to a stable identity the current schema provides (see resolveRule). */
  issueTitle: string
  /** Passive platform-detection signal (Phase 13.1) — informs wording only; gating itself is driven by wordpressConnected. */
  wordpressDetected: boolean
  /** True only if a wordpress_connections row with status='connected' exists for this website. */
  wordpressConnected: boolean
  /** Only meaningful when wordpressConnected is true — whether the stored credential was just successfully re-verified. */
  connectionValid: boolean
  /** Only present when wordpressConnected && connectionValid. */
  capabilities: WordPressCapabilities | null
  /** Accepted for forward-compatibility; no current rule branches on it. */
  pageUrl?: string | null
}

type Rule = {
  level: 'assisted' | 'manual'
  requiresWordPress: boolean
  requiredCapability: RequiredWordPressCapability | null
  reason: string
}

const EDIT_CONTENT_REASON =
  'This can be updated directly through your connected WordPress site once permissions are confirmed.'

const MEDIA_REASON =
  'Alt text can be added through your connected WordPress media library once permissions are confirmed.'

/**
 * One rule per known scanner issue key. Deliberately exhaustive — the
 * `satisfies` check below makes it a compile error to add a new issue to
 * issue-definitions.ts without also classifying it here, so nothing can
 * silently fall through to "unmapped."
 */
const RULES = {
  // --- Assisted candidates (Phase 14.2 target — Phase 14.1 only classifies) ---
  missing_meta_description: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  meta_description_too_short: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  meta_description_too_long: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  missing_title: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  title_too_short: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  title_too_long: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  missing_h1: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: `${EDIT_CONTENT_REASON} webioom will not change page layout or theme structure.`,
  },
  // Phase 15.3A: 'assisted' here only gates whether Prepare Fix's read-only
  // H1 source diagnostic can run — like missing_h1, there is no working H1
  // write path yet. Restructuring/removing headings still requires a
  // webioom write feature that does not exist yet.
  multiple_h1: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'edit_content',
    reason: `${EDIT_CONTENT_REASON} webioom will not change page layout or theme structure.`,
  },
  missing_image_alt: {
    level: 'assisted',
    requiresWordPress: true,
    requiredCapability: 'upload_media',
    reason: MEDIA_REASON,
  },

  // --- Always manual for now ---
  missing_canonical: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  invalid_canonical: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  canonical_cross_domain: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  canonical_http: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  no_https: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'This requires hosting/SSL configuration changes outside WordPress content.',
  },
  unreachable: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'This is a connectivity or infrastructure issue and requires manual investigation.',
  },
  page_not_found: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Restoring or redirecting a missing page requires a manual decision about the destination.',
  },
  page_gone: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Setting up a redirect requires a manual decision about the destination.',
  },
  page_forbidden: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Access rules are a server/security configuration matter requiring manual review.',
  },
  server_error: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Server errors require manual investigation of hosting/application logs.',
  },
  page_rate_limited: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Rate-limiting/bot-protection configuration requires manual review.',
  },
  unexpected_status: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'This unexpected server response requires manual investigation.',
  },
  too_many_redirects: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Redirect chains require manual review of server/hosting redirect rules.',
  },
  redirect_loop: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Redirect loops require manual review of server/hosting redirect rules.',
  },
  https_downgrade: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Redirect/SSL configuration changes must be made outside WordPress content.',
  },
  long_redirect_chain: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Redirect chains require manual review of server/hosting redirect rules.',
  },
  robots_not_found: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Adding a robots.txt file is a server-level change requiring manual review.',
  },
  robots_unreachable: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'This requires manual investigation of server/hosting configuration.',
  },
  robots_blocks_site: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'A site-wide crawler block requires manual confirmation before changing it.',
  },
  sitemap_not_found: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Creating and submitting a sitemap requires manual setup.',
  },
  sitemap_unreachable: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'This requires manual investigation of server/hosting configuration.',
  },
  sitemap_invalid: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Sitemap content requires manual review to fix safely.',
  },
  sitemap_external_urls: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Sitemap content requires manual review to fix safely.',
  },
  slow_response: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Performance issues require manual investigation of hosting/caching.',
  },
  large_html: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Reducing page weight requires manual review of markup and embedded content.',
  },
  low_text_content: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Adding meaningful content requires manual writing and review.',
  },
  empty_links: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Fixing link labels requires manual review to preserve intended behavior.',
  },
  empty_buttons: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Fixing button labels requires manual review to preserve intended behavior.',
  },
  missing_lang_attribute: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'This is a template/theme-level change requiring manual review.',
  },
  missing_og_title: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Open Graph tags require manual review to fix safely.',
  },
  missing_og_description: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Open Graph tags require manual review to fix safely.',
  },
  noindex: {
    level: 'manual',
    requiresWordPress: false,
    requiredCapability: null,
    reason: 'Removing a noindex directive requires manual confirmation it is intentional to change.',
  },
} as const satisfies Record<keyof typeof ISSUE_DEFINITIONS, Rule>

/** Reverse lookup built from ISSUE_DEFINITIONS itself, so it can never drift out of sync with the scanner's fixed titles. */
const TITLE_TO_KEY = new Map<string, keyof typeof RULES>(
  (Object.keys(ISSUE_DEFINITIONS) as (keyof typeof ISSUE_DEFINITIONS)[]).map((key) => [
    ISSUE_DEFINITIONS[key].title,
    key,
  ])
)

const MANUAL_RULE_DYNAMIC_TITLE: Rule = {
  level: 'manual',
  requiresWordPress: false,
  requiredCapability: null,
  reason: 'Broken or unverified links require manual review before changing anything.',
}

/**
 * Titles for internal-link issues are built dynamically per broken target
 * (e.g. "Broken internal link: /old-page") by check-internal-links.ts, so
 * they can't be exact-matched against ISSUE_DEFINITIONS. They're matched by
 * their fixed prefix instead — still centralized here, not scattered.
 */
const DYNAMIC_TITLE_PREFIXES = [
  'Broken internal link:',
  'Internal link points to a server-error page:',
  'Internal link has a redirect problem:',
  'Internal link could not be verified:',
]

function resolveRule(issueTitle: string): Rule | null {
  const key = TITLE_TO_KEY.get(issueTitle)
  if (key) return RULES[key]

  if (DYNAMIC_TITLE_PREFIXES.some((prefix) => issueTitle.startsWith(prefix))) {
    return MANUAL_RULE_DYNAMIC_TITLE
  }

  return null
}

/**
 * Combines canEditPages/canEditPosts into a single conservative signal:
 * 'available' if either is explicitly available; 'unavailable' only if
 * both are explicitly unavailable; 'unknown' otherwise. Uncertainty is
 * never collapsed into 'unavailable'.
 */
function resolveEditContentCapability(capabilities: WordPressCapabilities): CapabilityValue {
  if (capabilities.canEditPages === 'available' || capabilities.canEditPosts === 'available') {
    return 'available'
  }
  if (capabilities.canEditPages === 'unknown' || capabilities.canEditPosts === 'unknown') {
    return 'unknown'
  }
  return 'unavailable'
}

function resolveCapabilityValue(
  required: RequiredWordPressCapability | null,
  capabilities: WordPressCapabilities | null
): CapabilityValue {
  if (!required || !capabilities) return 'unknown'
  return required === 'upload_media' ? capabilities.canUploadMedia : resolveEditContentCapability(capabilities)
}

/**
 * Determines whether webioom may later be able to propose an assisted
 * WordPress-backed fix for an issue ('assisted'), whether the user should
 * fix it themselves for now ('manual'), or whether webioom cannot
 * currently perform or meaningfully assist with it at all ('unavailable').
 *
 * Pure and deterministic: no Supabase, no network calls, no React. Reuses
 * the existing WordPress capability model rather than re-deriving it —
 * capability gating never treats 'unknown' as if it were 'available'.
 */
export function evaluateFixability(context: FixabilityContext): FixabilityResult {
  const rule = resolveRule(context.issueTitle)

  if (!rule) {
    return {
      level: 'unavailable',
      reason: 'webioom does not yet recognize this issue type well enough to assist with a fix.',
      requiresWordPress: false,
    }
  }

  if (rule.level === 'manual') {
    return {
      level: 'manual',
      reason: rule.reason,
      requiresWordPress: rule.requiresWordPress,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  // rule.level === 'assisted' (candidate) — gate on the live WordPress connection.
  if (!context.wordpressConnected) {
    const suffix = context.wordpressDetected
      ? ' Connect WordPress to let webioom assist with this automatically.'
      : ' This currently requires a supported platform connection (such as WordPress), which was not detected for this site.'

    return {
      level: 'manual',
      reason: `${rule.reason}${suffix}`,
      requiresWordPress: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  if (!context.connectionValid) {
    return {
      level: 'unavailable',
      reason: 'Your WordPress connection needs attention before webioom can assist with this fix.',
      requiresWordPress: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  const capabilityValue = resolveCapabilityValue(rule.requiredCapability, context.capabilities)

  if (capabilityValue === 'unavailable') {
    return {
      level: 'unavailable',
      reason: 'Your connected WordPress account does not have the permission required for this fix.',
      requiresWordPress: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  if (capabilityValue === 'unknown') {
    return {
      level: 'manual',
      reason:
        'webioom could not confirm your WordPress account has the permission required for this fix.',
      requiresWordPress: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  return {
    level: 'assisted',
    reason: rule.reason,
    requiresWordPress: true,
    requiredCapability: rule.requiredCapability ?? undefined,
  }
}
