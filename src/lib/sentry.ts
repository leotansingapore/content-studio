import * as Sentry from '@sentry/react';

import { SupabaseRequestError } from './supabase-fetch-watch';
import { scrubSentryBreadcrumb, scrubSentryEvent } from './sentryScrub';
import { withPostHogSession } from './telemetryLink';

// Public by design (it only lets a browser send events in), but read from the
// build env so this file is the same in every app and a project can be pointed
// at Sentry without a code change. No DSN, nothing runs: sentry-boot.ts checks
// the same value before it even fetches this chunk.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

// Vercel builds previews with the same PROD flag as the real site, so without
// this the errors of every preview land in the same bucket as production.
const PRODUCTION_HOST = /^(app\.postmosis\.com|consultant-content-studio\.vercel\.app|content-studio-beige-eta\.vercel\.app)$/;

const FINGERPRINT_TAGS = ['supabase_method', 'supabase_resource', 'supabase_code', 'supabase_select', 'supabase_filters'];

/** From trackerattendance: one issue per broken Supabase query (supabase-fetch-watch.ts). */
export function shapeEvent<E extends Sentry.ErrorEvent>(event: E, hint: Sentry.EventHint): E {
  const error = hint.originalException;
  if (error instanceof SupabaseRequestError) {
    // One issue per broken query, not one per table: the same refusal from two
    // components is two bugs. The culprit names the query instead of the page.
    // sentryScrub.ts keeps a fingerprint only when every part is a fixed label or a Sentry
    // variable, so the query's parts travel as tags (cleaned like any tag) and the
    // fingerprint names them: Sentry resolves {{ tags.x }} when it groups the event.
    const [, method, resource, code, select, filters] = error.meta.fingerprint;
    event.fingerprint = ['supabase', ...FINGERPRINT_TAGS.map((t) => `{{ tags.${t} }}`)];
    (event as E & { culprit?: string }).culprit = `${error.meta.method} ${error.meta.resource}`;
    event.tags = {
      ...event.tags,
      supabase_method: method,
      supabase_resource: resource,
      supabase_code: code,
      supabase_select: select,
      supabase_filters: filters,
      http_status: String(error.meta.status),
    };
  }
  return event;
}

let ready = false;
const queued: Array<() => void> = [];

/**
 * Loaded dynamically by sentry-boot.ts once the page has finished loading, so
 * the SDK (~50kB gzip) never sits in front of the app code itself. Errors thrown
 * before that are buffered there and replayed here.
 */
export function initSentry(pending: unknown[] = []): void {
  if (!dsn || !import.meta.env.PROD) {
    ready = true;
    queued.length = 0;
    return;
  }

  Sentry.init({
    dsn,
    release: __APP_BUILD_ID__,
    environment: PRODUCTION_HOST.test(window.location.hostname) ? 'production' : 'preview',
    dataCollection: {
      // Request and response bodies carry whatever the app sends to Supabase.
      // None of that leaves for a third party. httpBodies defaults to
      // collecting all four kinds, so the empty array is doing real work;
      // userInfo matches the current default and is pinned against a flip.
      userInfo: false,
      httpBodies: [],
    },
    // The default ('always') rewrites the real TypeError message to append the
    // hostname, which then shows up verbatim in user-facing toasts.
    enhanceFetchErrorMessages: 'report-only',
    integrations: [Sentry.browserTracingIntegration()],
    // 1.0 is the wizard default and eats the free span quota in days.
    tracesSampleRate: 0.1,
    // Empty on purpose: propagating sentry-trace and baggage to edge functions
    // fails CORS preflight until their allowed headers include both.
    tracePropagationTargets: [],
    ignoreErrors: [
      // A Windows Chrome extension (usually a Microsoft Office or Outlook one)
      // rejects a promise with this string on page load. No stack, no app
      // frame, nothing here can fix it.
      /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
      // A deploy invalidates the chunks a still-open tab knows about. The app
      // recovers with a reload; reporting it is noise that needs no action.
      /Failed to fetch dynamically imported module/,
      /Importing a module script failed/,
      /error loading dynamically imported module/,
      /Loading (CSS )?chunk \S+ failed/,
    ],
    // shapeEvent groups Supabase refusals first. Page addresses carry sign-in codes
    // (?code=), review and phone links are bearer tokens, and /l/ and /t/ carry names.
    // sentryScrub.ts cleans them the way PostHog's are. The PostHog session id goes on
    // before that, so a fixer can read what led up to the error.
    beforeSend: (event, hint) => scrubSentryEvent(withPostHogSession(shapeEvent(event, hint))),
    beforeSendTransaction: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  });

  ready = true;
  for (const error of pending) Sentry.captureException(error);
  for (const send of queued) send();
  queued.length = 0;
}

/**
 * React swallows render errors it hands to a boundary, so the window handlers
 * never see them. Boundaries call this through a dynamic import (keeping the
 * SDK out of their chunk); anything that arrives before init waits for it.
 */
export function captureRenderError(error: unknown, componentStack?: string | null): void {
  const send = () =>
    Sentry.captureException(error, {
      contexts: { react: { componentStack: componentStack ?? undefined } },
    });
  if (ready) send();
  else if (queued.length < 5) queued.push(send);
}

/** Errors the app handled (no throw reached a window handler) but that are still defects. */
export function captureHandledError(error: unknown): void {
  Sentry.captureException(error);
}
