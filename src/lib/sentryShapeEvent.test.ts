import { afterEach, describe, it, expect, vi } from 'vitest';

// initSentry's gate and settings: a fake SDK, and a DSN set before sentry.ts reads it at import.
const sdk = vi.hoisted(() => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@o1.ingest.sentry.io/1');
  return { init: vi.fn(), captureException: vi.fn(), browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })) };
});
vi.mock('@sentry/react', () => sdk);

import { captureRenderError, initSentry, shapeEvent } from './sentry';
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

describe('where Sentry starts and what it collects', () => {
  type Config = {
    environment: string;
    dataCollection: { userInfo: boolean; httpBodies: string[] };
    tracePropagationTargets: unknown[];
    beforeSend: (event: object, hint: object) => { request?: { url?: string } };
  };
  const build = (prod: boolean, hostname = 'app.postmosis.com') => {
    vi.stubEnv('PROD', prod);
    vi.stubGlobal('window', { location: { hostname } });
    vi.stubGlobal('__APP_BUILD_ID__', 'b1');
  };
  const config = (i = 0) => sdk.init.mock.calls[i][0] as Config;

  afterEach(() => {
    sdk.init.mockClear();
    sdk.captureException.mockClear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs(); // the DSN is already read at import
  });

  it('holds render errors until it starts, then sends them with the errors caught before', () => {
    build(true);
    for (let i = 0; i < 6; i++) captureRenderError(new Error(`render ${i}`), 'at Card');
    expect(sdk.captureException).not.toHaveBeenCalled();
    const early = new Error('before load');
    initSentry([early]);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException.mock.calls.map(([e]) => (e as Error).message)).toEqual(['before load', 'render 0', 'render 1', 'render 2', 'render 3', 'render 4']);
  });

  it('collects no user, no request bodies and no trace headers, and cleans the page address before sending', () => {
    build(true);
    initSentry();
    expect(config().environment).toBe('production');
    expect(config().dataCollection).toEqual({ userInfo: false, httpBodies: [] });
    expect(config().tracePropagationTargets).toEqual([]);
    const sent = config().beforeSend({ request: { url: 'https://app.postmosis.com/review/abcdefghij?role=author' } }, {});
    expect(sent.request?.url).toBe('https://app.postmosis.com/review/:person');
  });

  it("marks a preview deployment's errors as preview, and sends nothing from a development build", () => {
    build(true, 'content-studio-git-main-leo.vercel.app');
    initSentry();
    expect(config().environment).toBe('preview');
    sdk.init.mockClear();
    build(false);
    initSentry([new Error('dev')]);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});
