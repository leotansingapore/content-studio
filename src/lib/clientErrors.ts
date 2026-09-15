// Crash reporting and new-deploy recovery.
//
// - reportClientError sends a capped, de-duplicated report to cs_client_errors
//   (supabase/hub/007_client_errors.sql) so crashes stop being invisible.
//   Signed-in users only; RLS rejects anonymous inserts, which we ignore.
// - After a deploy, a tab opened earlier asks for code chunks that no longer
//   exist. reloadForNewVersion reloads once to pick up the new build, and
//   refuses to loop if the reload didn't help.

import { supabase } from "@/lib/supabase";

const MAX_REPORTS_PER_PAGE = 5;
const RELOAD_KEY = "cs-chunk-reload-at"; // sessionStorage, outside the synced prefix
const RELOAD_COOLDOWN_MS = 30_000;
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i;
// Browser noise that isn't a bug in the app.
const IGNORED_RE = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection captured/i;

const reported = new Set<string>();

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : JSON.stringify(value) ?? String(value));
}

export function isChunkLoadError(value: unknown): boolean {
  return CHUNK_ERROR_RE.test(toError(value).message);
}

function currentRelease(): string {
  const src = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.src ?? "";
  return src.match(/index-([\w-]+)\.js/)?.[1] ?? "dev";
}

export function reportClientError(value: unknown, context?: string) {
  try {
    const error = toError(value);
    if (IGNORED_RE.test(error.message)) return;
    const fingerprint = `${error.name}: ${error.message}`;
    if (reported.has(fingerprint) || reported.size >= MAX_REPORTS_PER_PAGE) return;
    reported.add(fingerprint);
    supabase
      .from("cs_client_errors")
      .insert({
        message: fingerprint.slice(0, 1000),
        stack: error.stack?.slice(0, 4000) ?? null,
        context: context?.slice(0, 4000) ?? null,
        path: window.location.pathname.slice(0, 500),
        release: currentRelease(),
        user_agent: navigator.userAgent.slice(0, 300),
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // reporting must never throw
  }
}

/** Reload to pick up a new deploy. Returns false (and doesn't reload) if we just tried. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function installGlobalErrorHandlers() {
  // Vite fires this when a lazy route's preload fails (usually a stale tab).
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
  window.addEventListener("error", (event) => {
    reportClientError(event.error ?? event.message, "window error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, "unhandled rejection");
  });
}
