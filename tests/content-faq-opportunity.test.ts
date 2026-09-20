import { describe, expect, it } from 'vitest'
import { analyzeFaqOpportunity } from '@/lib/content/checks/faq-opportunity'
import { contentContextFor } from './helpers/content-fixtures'
import { makePage } from './helpers/architecture-fixtures'

describe('analyzeFaqOpportunity', () => {
  it('is kind "opportunity", never "problem"', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 200, h1_text: 'Our Services', content_heading_texts: ['What We Offer'] })
    const finding = analyzeFaqOpportunity(contentContextFor([page])).find((f) => f.checkKey === 'faq_opportunity')
    expect(finding?.kind).toBe('opportunity')
  })

  it('suggests an FAQ section for a substantive page with no question/FAQ-signal heading', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 200, h1_text: 'Our Services', content_heading_texts: ['What We Offer', 'Our Process'] })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toHaveLength(1)
  })

  it('does not suggest when an H2 already contains an FAQ signal word', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 200, h1_text: 'Our Services', content_heading_texts: ['Frequently Asked Questions'] })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toEqual([])
  })

  it('does not suggest when the H1 itself is question-formatted', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 200, h1_text: 'What services do we offer?', content_heading_texts: [] })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toEqual([])
  })

  it('does not suggest for a thin page — content must already be substantive', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 50, h1_text: 'Our Services', content_heading_texts: [] })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toEqual([])
  })

  it('does not evaluate an ineligible page', () => {
    const page = makePage({ url: 'https://example.com/utility', content_word_count: 200, content_heading_texts: [], noindex: true })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toEqual([])
  })

  it('REAL-WORLD FALSE-NEGATIVE FIX: a marketing CTA phrased as a question ("Ready to Grow Your Business?") no longer suppresses the opportunity', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 200, h1_text: 'Our Services', content_heading_texts: ['Ready to Grow Your Business?'] })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toHaveLength(1)
  })

  it('other common CTA-as-question phrasings ("Want to...", "Looking for...") also do not suppress the opportunity', () => {
    const wantTo = makePage({ url: 'https://example.com/services', content_word_count: 200, content_heading_texts: ['Want to Learn More?'] })
    const lookingFor = makePage({ url: 'https://example.com/services', content_word_count: 200, content_heading_texts: ['Looking for a Better Solution?'] })
    expect(analyzeFaqOpportunity(contentContextFor([wantTo]))).toHaveLength(1)
    expect(analyzeFaqOpportunity(contentContextFor([lookingFor]))).toHaveLength(1)
  })

  it('a genuine WH-question heading ("How much does this cost?") still counts as real question coverage and suppresses the opportunity', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 200, content_heading_texts: ['How much does this cost?'] })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toEqual([])
  })

  it('does not suggest an FAQ for a contact page — page purpose makes the suggestion irrelevant there, even with no question heading at all', () => {
    const page = makePage({ url: 'https://example.com/contact', title: 'Contact Us', content_word_count: 200, content_heading_texts: [] })
    expect(analyzeFaqOpportunity(contentContextFor([page]))).toEqual([])
  })
})
