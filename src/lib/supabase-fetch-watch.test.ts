import { describe, it, expect, beforeEach } from 'vitest';
import {
  describeFailure,
  installFetchWatch,
  onSupabaseError,
  resetSupabaseWatchForTests,
  SupabaseRequestError,
} from './supabase-fetch-watch';

/**
 * The defect this covers: Supabase returns a refused query as { error }, the app
 * showed "User Not Found", and Sentry, which only sees throws, recorded nothing
 * for six days. The watch turns failed Supabase responses into Sentry issues the
 * autofix job can act on, without changing what the caller receives and without
 * sending filter values.
 */

const REST = 'https://hgdbflprrficdoyxmdxe.supabase.co/rest/v1';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = () => new Promise((r) => setTimeout(r, 0));

function watchedFetch(respond: () => Promise<Response>) {
  const win = { fetch: (() => respond()) as unknown as typeof fetch };
  installFetchWatch(win);
  const reported: SupabaseRequestError[] = [];
  onSupabaseError((e) => reported.push(e));
  return { fetch: win.fetch, reported };
}

beforeEach(() => resetSupabaseWatchForTests());

describe('describeFailure', () => {
  it('names the table, selected and filtered columns of a refused query, never the values', () => {
    const e = describeFailure(
      `${REST}/profiles?select=user_id%2Cname%2Cpreferred_name&slug=eq.dave-teng-hr`,
      'GET',
      401,
      { code: '42501', message: 'permission denied for table profiles', details: null as unknown as string },
    )!;
    expect(e.message).toBe(
      '42501 permission denied for table profiles (GET profiles select=user_id,name,preferred_name filter=slug)',
    );
    expect(e.message).not.toContain('dave');
    expect(e.meta.fingerprint).toEqual(['supabase', 'GET', 'profiles', '42501', 'user_id,name,preferred_name', 'slug']);
  });

  it('reports a value a column type refuses (the user_stats half point) without the value', () => {
    const e = describeFailure(`${REST}/user_stats?user_id=eq.abc`, 'PATCH', 400, {
      code: '22P02',
      message: 'invalid input syntax for type integer: "116.5"',
    })!;
    expect(e.message).toBe('22P02 invalid input syntax for type integer: "<value>" (PATCH user_stats filter=user_id)');
  });

  it('keeps order columns and drops paging', () => {
    const e = describeFailure(`${REST}/attendance?select=*&user_id=eq.x&order=check_in_time.desc&limit=10`, 'GET', 401, {
      code: '42501',
      message: 'permission denied for table attendance',
    })!;
    expect(e.meta.filters).toEqual(['user_id', 'check_in_time']);
  });

  it('ignores what is normal use: zero rows for .single(), expired JWTs, success, other hosts, auth', () => {
    expect(describeFailure(`${REST}/table_column_preferences?user_id=eq.x`, 'GET', 406, {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
      details: 'The result contains 0 rows',
    })).toBeNull();
    expect(describeFailure(`${REST}/profiles`, 'GET', 401, { code: 'PGRST303', message: 'JWT expired' })).toBeNull();
    expect(describeFailure(`${REST}/profiles`, 'GET', 200, null)).toBeNull();
    expect(describeFailure('https://example.com/rest/v1/profiles', 'GET', 500, null)).toBeNull();
    expect(describeFailure('https://hgdbflprrficdoyxmdxe.supabase.co/auth/v1/token?grant_type=password', 'POST', 400, null)).toBeNull();
  });

  it('still reports .single() matching several rows', () => {
    expect(describeFailure(`${REST}/profiles?slug=eq.x`, 'GET', 406, {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
      details: 'The result contains 2 rows',
    })).not.toBeNull();
  });

  it('reports a bad storage request but not a missing file, and only crashing functions', () => {
    const base = 'https://hgdbflprrficdoyxmdxe.supabase.co';
    expect(describeFailure(`${base}/storage/v1/object/sign/leave-documents/https:/x.png`, 'POST', 400, {
      statusCode: '400',
      error: 'InvalidKey',
      message: 'Invalid key',
    })!.meta.resource).toBe('storage sign leave-documents');
    expect(describeFailure(`${base}/storage/v1/object/leave-documents/u/a.pdf`, 'GET', 404, { error: 'not_found' })).toBeNull();
    expect(describeFailure(`${base}/functions/v1/send-leave-notification`, 'POST', 400, null)).toBeNull();
    expect(describeFailure(`${base}/functions/v1/process-reminder-queue`, 'POST', 502, null)!.meta.resource).toBe(
      'function process-reminder-queue',
    );
  });
});

describe('installFetchWatch', () => {
  it('reports a failed Supabase response and hands the caller the same, still readable response', async () => {
    const { fetch, reported } = watchedFetch(async () => json(401, { code: '42501', message: 'permission denied for table profiles' }));
    const res = await fetch(`${REST}/profiles?select=user_id&slug=eq.x`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: '42501', message: 'permission denied for table profiles' });
    await flush();
    expect(reported).toHaveLength(1);
    expect(reported[0].name).toBe('SupabaseRequestError');
  });

  it('reports the same broken query once per page load', async () => {
    const { fetch, reported } = watchedFetch(async () => json(401, { code: '42501', message: 'denied' }));
    await fetch(`${REST}/profiles?select=user_id&slug=eq.a`);
    await fetch(`${REST}/profiles?select=user_id&slug=eq.b`);
    await flush();
    expect(reported).toHaveLength(1);
  });

  it('holds reports made before Sentry connects and hands them over', async () => {
    const win = { fetch: (async () => json(401, { code: '42501', message: 'denied' })) as unknown as typeof fetch };
    installFetchWatch(win);
    await win.fetch(`${REST}/attendance?select=*`);
    await flush();
    const late: SupabaseRequestError[] = [];
    onSupabaseError((e) => late.push(e));
    expect(late).toHaveLength(1);
  });

  it('passes a network failure through to the caller and reports nothing', async () => {
    const { fetch, reported } = watchedFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetch(`${REST}/profiles`)).rejects.toThrow('Failed to fetch');
    await flush();
    expect(reported).toHaveLength(0);
  });

  it('wraps only once', () => {
    const win = { fetch: (async () => json(200, [])) as unknown as typeof fetch };
    installFetchWatch(win);
    const first = win.fetch;
    installFetchWatch(win);
    expect(win.fetch).toBe(first);
  });
});
