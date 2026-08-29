import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import type {
  RequiredIntegrationCapability,
  IntegrationCapabilityState,
  IntegrationCapabilitySnapshot,
  IntegrationConnectionState,
} from '@/lib/integrations/platform'

export type FixabilityLevel = 'assisted' | 'manual' | 'unavailable'

export type FixabilityResult = {
  level: FixabilityLevel
  reason: string
  requiredCapability?: RequiredIntegrationCapability
  /** Whether this fix family requires a connected platform integration to execute at all (today: WordPress, the only implemented one). Generic on purpose — see Phase 19.1/19.4. */
  requiresIntegration: boolean
}

export type FixabilityContext = {
  /** The issue's title, as stored on the issues row — the closest thing to a stable identity the current schema provides (see resolveRule). */
  issueTitle: string
  /**
   * Passive platform-detection signal — informs wording only; gating itself
   * is driven by connectionState. True when the scanned site appears to run
   * a platform webioom currently has a supported integration for (today:
   * WordPress, detected by lib/integrations/wordpress/detect-wordpress.ts).
   */
  integrationDetected: boolean
  /**
   * The connected integration's execution-eligibility state — the smallest
   * normalized state this file actually branches on. Provider-specific
   * diagnostics (e.g. WordPress's revoked/unreachable/malformed) are never
   * passed down here; they stay in the integration layer, which is
   * responsible for collapsing them into one of these three states before
   * calling evaluateFixability. See lib/integrations/platform.ts.
   */
  connectionState: IntegrationConnectionState
  /** Only present when connectionState === 'connected'. A generic snapshot — see lib/integrations/platform.ts's IntegrationCapabilitySnapshot. The integration layer (e.g. lib/integrations/wordpress/adapter.ts's resolveRequiredWordPressCapability) is solely responsible for resolving this from whatever native capability model the connected platform actually has. */
  capabilities: IntegrationCapabilitySnapshot | null
  /** Accepted for forward-compatibility; no current rule branches on it. */
  pageUrl?: string | null
}

type Rule = {
  level: 'assisted' | 'manual'
  requiresIntegration: boolean
  requiredCapability: RequiredIntegrationCapability | null
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
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  meta_description_too_short: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  meta_description_too_long: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  missing_title: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  title_too_short: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  title_too_long: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: EDIT_CONTENT_REASON,
  },
  missing_h1: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: `${EDIT_CONTENT_REASON} webioom will not change page layout or theme structure.`,
  },
  // Phase 15.3A: 'assisted' here only gates whether Prepare Fix's read-only
  // H1 source diagnostic can run — like missing_h1, there is no working H1
  // write path yet. Restructuring/removing headings still requires a
  // webioom write feature that does not exist yet.
  multiple_h1: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'edit_content',
    reason: `${EDIT_CONTENT_REASON} webioom will not change page layout or theme structure.`,
  },
  missing_image_alt: {
    level: 'assisted',
    requiresIntegration: true,
    requiredCapability: 'upload_media',
    reason: MEDIA_REASON,
  },

  // --- Always manual for now ---
  missing_canonical: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  invalid_canonical: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  canonical_cross_domain: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  canonical_http: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Canonical tags require manual review to avoid unintended SEO impact.',
  },
  no_https: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'This requires hosting/SSL configuration changes outside WordPress content.',
  },
  unreachable: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'This is a connectivity or infrastructure issue and requires manual investigation.',
  },
  page_not_found: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Restoring or redirecting a missing page requires a manual decision about the destination.',
  },
  page_gone: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Setting up a redirect requires a manual decision about the destination.',
  },
  page_forbidden: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Access rules are a server/security configuration matter requiring manual review.',
  },
  server_error: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Server errors require manual investigation of hosting/application logs.',
  },
  page_rate_limited: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Rate-limiting/bot-protection configuration requires manual review.',
  },
  unexpected_status: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'This unexpected server response requires manual investigation.',
  },
  too_many_redirects: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Redirect chains require manual review of server/hosting redirect rules.',
  },
  redirect_loop: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Redirect loops require manual review of server/hosting redirect rules.',
  },
  https_downgrade: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Redirect/SSL configuration changes must be made outside WordPress content.',
  },
  long_redirect_chain: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Redirect chains require manual review of server/hosting redirect rules.',
  },
  robots_not_found: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Adding a robots.txt file is a server-level change requiring manual review.',
  },
  robots_unreachable: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'This requires manual investigation of server/hosting configuration.',
  },
  robots_blocks_site: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'A site-wide crawler block requires manual confirmation before changing it.',
  },
  sitemap_not_found: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Creating and submitting a sitemap requires manual setup.',
  },
  sitemap_unreachable: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'This requires manual investigation of server/hosting configuration.',
  },
  sitemap_invalid: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Sitemap content requires manual review to fix safely.',
  },
  sitemap_external_urls: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Sitemap content requires manual review to fix safely.',
  },
  slow_response: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Performance issues require manual investigation of hosting/caching.',
  },
  large_html: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Reducing page weight requires manual review of markup and embedded content.',
  },
  low_text_content: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Adding meaningful content requires manual writing and review.',
  },
  empty_links: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Fixing link labels requires manual review to preserve intended behavior.',
  },
  empty_buttons: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Fixing button labels requires manual review to preserve intended behavior.',
  },
  missing_lang_attribute: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'This is a template/theme-level change requiring manual review.',
  },
  missing_og_title: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Open Graph tags require manual review to fix safely.',
  },
  missing_og_description: {
    level: 'manual',
    requiresIntegration: false,
    requiredCapability: null,
    reason: 'Open Graph tags require manual review to fix safely.',
  },
  noindex: {
    level: 'manual',
    requiresIntegration: false,
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
  requiresIntegration: false,
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
 * Straight lookup into the already-resolved generic capability snapshot —
 * no capability-combining logic lives here anymore (Phase 19.4). Whatever
 * native reasoning is required to produce this snapshot (e.g. WordPress's
 * "canEditPages OR canEditPosts" combining) is entirely the connected
 * integration's responsibility — see
 * lib/integrations/wordpress/adapter.ts's resolveRequiredWordPressCapability,
 * which is now the single source of truth for that translation. Matches the
 * original behavior exactly: no required capability, or no snapshot at all,
 * resolves to 'unknown' — never guessed as available.
 */
function resolveSnapshotCapability(
  required: RequiredIntegrationCapability | null,
  capabilities: IntegrationCapabilitySnapshot | null
): IntegrationCapabilityState {
  if (!required || !capabilities) return 'unknown'
  return capabilities[required]
}

/**
 * Determines whether webioom may later be able to propose an assisted,
 * integration-backed fix for an issue ('assisted'), whether the user should
 * fix it themselves for now ('manual'), or whether webioom cannot currently
 * perform or meaningfully assist with it at all ('unavailable').
 *
 * Pure and deterministic: no Supabase, no network calls, no React, and —
 * as of Phase 19.4 — no knowledge of any specific platform's native
 * capability model. Capability gating never treats 'unknown' as if it were
 * 'available'.
 */
export function evaluateFixability(context: FixabilityContext): FixabilityResult {
  const rule = resolveRule(context.issueTitle)

  if (!rule) {
    return {
      level: 'unavailable',
      reason: 'webioom does not yet recognize this issue type well enough to assist with a fix.',
      requiresIntegration: false,
    }
  }

  if (rule.level === 'manual') {
    return {
      level: 'manual',
      reason: rule.reason,
      requiresIntegration: rule.requiresIntegration,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  // rule.level === 'assisted' (candidate) — gate on the live integration connection.
  if (context.connectionState === 'not_connected') {
    const suffix = context.integrationDetected
      ? ' Connect WordPress to let webioom assist with this automatically.'
      : ' This currently requires a supported platform connection (such as WordPress), which was not detected for this site.'

    return {
      level: 'manual',
      reason: `${rule.reason}${suffix}`,
      requiresIntegration: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  if (context.connectionState === 'needs_attention') {
    return {
      level: 'unavailable',
      reason: 'Your WordPress connection needs attention before webioom can assist with this fix.',
      requiresIntegration: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  // context.connectionState === 'connected'
  const capabilityValue = resolveSnapshotCapability(rule.requiredCapability, context.capabilities)

  if (capabilityValue === 'unavailable') {
    return {
      level: 'unavailable',
      reason: 'Your connected WordPress account does not have the permission required for this fix.',
      requiresIntegration: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  if (capabilityValue === 'unknown') {
    return {
      level: 'manual',
      reason:
        'webioom could not confirm your WordPress account has the permission required for this fix.',
      requiresIntegration: true,
      requiredCapability: rule.requiredCapability ?? undefined,
    }
  }

  return {
    level: 'assisted',
    reason: rule.reason,
    requiresIntegration: true,
    requiredCapability: rule.requiredCapability ?? undefined,
  }
}
