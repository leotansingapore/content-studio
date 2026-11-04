import { describe, it, expect } from 'vitest';
import { shapeEvent } from './sentry';
import { describeFailure } from './supabase-fetch-watch';
import { scrubSentryEvent } from './sentryScrub';

/**
 * Ported from trackerattendance. A new Sentry issue posts a Lark card to an
 * EXTERNAL group, and the card shows the culprit, which Sentry takes from the
 * page path. Here /l/ and /t/ paths carry an adviser's or a link's name, so a
 * failed query names the query instead, and the path is cleaned like any URL.
 */

const refused = describeFailure(
  'https://hgdbflprrficdoyxmdxe.supabase.co/rest/v1/cs_bio_pages?select=id,slug&slug=eq.john-tan',
  'GET',
  401,
  { code: '42501', message: 'permission denied for table cs_bio_pages' },
)!;

describe('shapeEvent', () => {
  it('leaves an event that is not a failed query alone', () => {
    const e = shapeEvent({ type: undefined, transaction: '/calendar' } as any, {});
    expect(e.transaction).toBe('/calendar');
    expect((e as any).fingerprint).toBeUndefined();
  });

  it('names the query, not the page, as the culprit of a failed query, with its fingerprint and tags', () => {
    const e = scrubSentryEvent(shapeEvent({ type: undefined, transaction: '/l/john-tan' } as any, {
      originalException: refused,
    }) as any) as any;
    expect(e.culprit).toBe('GET cs_bio_pages');
    expect(e.transaction).toBe('/l/:person');
    expect(e.fingerprint).toEqual(['supabase', '{{ tags.supabase_method }}', '{{ tags.supabase_resource }}', '{{ tags.supabase_code }}', '{{ tags.supabase_select }}', '{{ tags.supabase_filters }}']);
    expect(e.tags).toMatchObject({ supabase_method: 'GET', supabase_resource: 'cs_bio_pages', supabase_code: '42501', supabase_select: 'id,slug', supabase_filters: 'slug', http_status: '401' });
    expect(JSON.stringify(e)).not.toContain('john');
  });

  it('keeps the query grouping and culprit through the cleaner, for any query shape', () => {
    const wide = describeFailure(
      'https://hgdbflprrficdoyxmdxe.supabase.co/rest/v1/cs_tracked_links?select=id,campaign_id,slug,label,url,created_at&profile_id=eq.x&order=created_at.desc',
      'GET',
      401,
      { code: '42501', message: 'permission denied for table cs_tracked_links' },
    )!;
    const e = scrubSentryEvent(shapeEvent({ type: undefined, transaction: '/t/report/john-tan' } as any, { originalException: wide }) as any) as any;
    expect(e.culprit).toBe('GET cs_tracked_links');
    expect(e.transaction).toBe('/t/report/:person');
    expect(e.fingerprint).toEqual(['supabase', '{{ tags.supabase_method }}', '{{ tags.supabase_resource }}', '{{ tags.supabase_code }}', '{{ tags.supabase_select }}', '{{ tags.supabase_filters }}']);
    expect(e.tags).toMatchObject({ supabase_method: 'GET', supabase_resource: 'cs_tracked_links', supabase_code: '42501', supabase_select: 'id,campaign_id,slug,label,url,created_at', supabase_filters: 'profile_id,created_at' });
  });
});
