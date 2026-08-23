/**
 * Deterministically reduces a WordPress page/post's raw content.raw (which
 * may contain HTML, Gutenberg block comments, shortcodes, embeds, or
 * page-builder markup) down to plain reference text for the AI title
 * recommender. Never executed as HTML/script — this only ever produces a
 * plain string that later gets sent as-is inside a text prompt field, never
 * rendered or interpreted.
 *
 * Truncated to 5,000 characters: the middle of a 4,000–6,000 character
 * range judged enough for a model to understand what the page is about
 * without excessive prompt size/cost.
 */
const MAX_CONTENT_CHARS = 5000

export function preparePageContentForAi(rawContent: string | null): string {
  if (!rawContent) return ''

  let text = rawContent

  // Drop script/style content entirely, not just the tags, so embedded code
  // or CSS never leaks into the AI input.
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')

  // Gutenberg block comments, e.g. <!-- wp:paragraph --> / <!-- /wp:group -->.
  text = text.replace(/<!--\s*\/?wp:[\s\S]*?-->/gi, ' ')

  // Any remaining HTML comments (page-builder metadata, etc.).
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')

  // Shortcodes, e.g. [gallery ids="1,2,3"] or [/vc_row].
  text = text.replace(/\[\/?[a-zA-Z0-9_-]+[^\]]*\]/g, ' ')

  // Remaining HTML tags.
  text = text.replace(/<[^>]*>/g, ' ')

  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  text = text.replace(/\s+/g, ' ').trim()

  return text.slice(0, MAX_CONTENT_CHARS)
}
