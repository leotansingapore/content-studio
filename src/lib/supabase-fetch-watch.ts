// From trackerattendance (src/lib/supabase-fetch-watch.ts), where the gap was found.
// Supabase answers a refused or broken query with an error VALUE ({ data: null,
// error }), never a throw, and an app turns most of those into a toast or an
// empty state. Sentry only sees throws. So on 2026-09-21 in trackerattendance a
// permission error that turned every user analytics link into "User Not Found" had been live for six
// days with zero Sentry events, and a float refused by an integer column had
// been silently dropping whole user_stats saves.
//
// This wraps window.fetch and hands every failed Supabase REST, storage or edge
// function response to sentry-boot as a SupabaseRequestError, one per distinct
// query per page load. It must be the FIRST import in main.tsx: supabase-js
// copies the global fetch when lib/supabase.ts first runs, so a wrapper installed any
// later is never called.
//
// Sent: method, table / rpc / bucket / function, the selected and filtered
// COLUMN NAMES, HTTP status, Postgres code and message. Not sent: filter values,
// request or response bodies, and `details` (it can carry row data, such as the
// key of a duplicate).

// The same value lib/supabase.ts uses, read here rather than imported: importing it
// would create the client, and copy fetch, before the watch below is installed.
const SUPABASE_ORIGIN = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://hgdbflprrficdoyxmdxe.supabase.co';

// PostgREST codes that are normal use, not defects: the JWT answers around a
// token refresh (supabase-js refreshes and the next call succeeds).
const EXPECTED_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);
const NOT_FILTERS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const STORAGE_OPS = new Set(['sign', 'public', 'authenticated', 'info', 'list', 'move', 'copy', 'upload']);

export interface SupabaseRequestMeta {
  status: number;
  code: string;
  method: string;
  resource: string;
  select: string;
  filters: string[];
  fingerprint: string[];
}

export class SupabaseRequestError extends Error {
  meta: SupabaseRequestMeta;
  constructor(message: string, meta: SupabaseRequestMeta) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.meta = meta;
  }
}

type Body = { code?: string; message?: string; details?: string; error?: string; statusCode?: string } | null;

/** The error to report for one response, or null when there is nothing wrong. */
export function describeFailure(url: string, method: string, status: number, body: Body): SupabaseRequestError | null {
  if (status < 400 || !url.startsWith(SUPABASE_ORIGIN)) return null;
  const u = new URL(url);
  const path = u.pathname;
  let resource: string;
  let select = '';
  let filters: string[] = [];

  if (path.startsWith('/rest/v1/')) {
    resource = path.slice('/rest/v1/'.length) || '/';
    if (body?.code && EXPECTED_CODES.has(body.code)) return null;
    // .single()/.maybeSingle() on zero rows: the caller asked "is there one?".
    if (body?.code === 'PGRST116' && /\b0 rows\b/.test(body.details ?? '')) return null;
    select = (u.searchParams.get('select') ?? '').replace(/\s+/g, '').slice(0, 200);
    const order = (u.searchParams.get('order') ?? '').split(',').map((o) => o.split('.')[0]).filter(Boolean);
    filters = [...new Set([...[...u.searchParams.keys()].filter((k) => !NOT_FILTERS.has(k)), ...order])];
  } else if (path.startsWith('/storage/v1/object/')) {
    // A missing object is how "does this file exist" is answered.
    if (status === 404 || body?.error === 'not_found') return null;
    const parts = path.slice('/storage/v1/object/'.length).split('/');
    const [op, bucket] = STORAGE_OPS.has(parts[0]) ? [parts[0], parts[1]] : ['object', parts[0]];
    resource = `storage ${op} ${bucket ?? ''}`.trim();
  } else if (path.startsWith('/functions/v1/')) {
    // Functions answer 4xx on purpose for bad input; only a crash is a defect.
    if (status < 500) return null;
    resource = `function ${path.slice('/functions/v1/'.length).split('/')[0]}`;
  } else {
    return null; // auth: a wrong password is a 400 and not a bug
  }

  const code = body?.code ?? body?.error ?? String(status);
  // Class 22 (data exceptions) quote the value that was refused, which can be
  // anything a user typed. The type name says enough.
  const raw = body?.message ?? '';
  const text = (code.startsWith('22') ? raw.replace(/"[^"]*"/g, '"<value>"') : raw).slice(0, 200);
  const shape = [select && `select=${select}`, filters.length > 0 && `filter=${filters.join(',')}`].filter(Boolean).join(' ');
  const message = `${code} ${text || `HTTP ${status}`} (${method} ${resource}${shape ? ` ${shape}` : ''})`;
  return new SupabaseRequestError(message, {
    status,
    code,
    method,
    resource,
    select,
    filters,
    fingerprint: ['supabase', method, resource, code, select, filters.join(',')],
  });
}

let sink: ((error: SupabaseRequestError) => void) | null = null;
const early: SupabaseRequestError[] = [];
const seen = new Set<string>();

function report(error: SupabaseRequestError): void {
  const key = error.meta.fingerprint.join('|');
  if (seen.has(key)) return;
  seen.add(key);
  if (sink) sink(error);
  else if (early.length < 10) early.push(error);
}

/** sentry-boot connects here; anything caught before it did is handed over now. */
export function onSupabaseError(fn: (error: SupabaseRequestError) => void): void {
  sink = fn;
  for (const error of early.splice(0)) fn(error);
}

export function installFetchWatch(win: { fetch: typeof fetch }): void {
  const original = win.fetch;
  if (!original || (original as { __supabaseWatch?: boolean }).__supabaseWatch) return;
  const watched = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const pending = original.call(win, input, init);
    void pending
      .then(async (response) => {
        if (response.ok) return;
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.startsWith(SUPABASE_ORIGIN)) return;
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        let body: Body = null;
        try {
          body = await response.clone().json();
        } catch {
          // not JSON; the status still says enough
        }
        const error = describeFailure(url, method, response.status, body);
        if (error) report(error);
      })
      .catch(() => {
        // A network failure already rejects the caller's promise; nothing to add.
      });
    return pending;
  } as typeof fetch & { __supabaseWatch?: boolean };
  watched.__supabaseWatch = true;
  win.fetch = watched;
}

/** Test seam: forget what this page load already reported. */
export function resetSupabaseWatchForTests(): void {
  sink = null;
  early.length = 0;
  seen.clear();
}

// Dormant with no DSN: nothing would ever collect what it reports.
if (typeof window !== 'undefined' && import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) installFetchWatch(window);
