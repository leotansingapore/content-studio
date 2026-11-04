import { describe, expect, it } from 'vitest'
import { isIdSegment, scrubUrl } from './scrubUrl'

// The id rules PostHog and Sentry share; posthog.test.ts covers the routes, hosts and schemes.
describe('what a page address loses before it leaves', () => {
  it('drops a phone number or a long number inside a page slug', () => {
    expect(scrubUrl('https://app.postmosis.com/hub/guides/call-me-91234567')).toBe('https://app.postmosis.com/hub/guides/:id')
    expect(scrubUrl('/inspiration/order-2026110512')).toBe('/inspiration/:id')
    expect(isIdSegment('linkedin-cpf-myth-young-adult-001')).toBe(false)
  })

  it('drops a long mixed-case token with no digit in it, and keeps a short mixed-case word', () => {
    expect(scrubUrl('/working/AbCdEfGhIjKlMnOpQr')).toBe('/working/:id')
    expect(scrubUrl('/fads/Tab')).toBe('/fads/Tab')
  })

  it('drops a slug that ends in a long hex token', () => {
    expect(scrubUrl('/design/report-9f8a6d0b81c8e84c7da659a2feaa0c55')).toBe('/design/:id')
  })
})
