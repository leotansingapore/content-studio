// Screen state that lives in the address bar, so any view, filter, period or open item can be linked
// (Leo 2026-10-13: "everything throughout the app should be deep-linked"). The params each page reads are
// listed in docs/deep-links.md; links are built in src/lib/links.ts.
import { useCallback, useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { slug } from "./links";

interface Opts<T extends string> {
  /** Values outside this list read as the fallback, so an old or hand-typed link never breaks the page. */
  allowed?: readonly T[];
  /** localStorage key: used when the URL has no value, written whenever the person picks. */
  remember?: string;
  /** Push a history entry on set (opening something). Default: replace (filters, views, tabs). */
  push?: boolean;
}

const memory = {
  get: (k?: string) => {
    if (!k) return null;
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string | undefined, v: string) => {
    if (!k) return;
    try {
      localStorage.setItem(k, v);
    } catch {
      /* fine for this visit */
    }
  },
};

/** The value a page shows: the URL wins, then the remembered pick, then the fallback. */
export function pickValue<T extends string>(fromUrl: string | null, kept: string | null, fallback: T, allowed?: readonly T[]): T {
  const ok = (v: string | null): v is T => !!v && (!allowed || (allowed as readonly string[]).includes(v));
  return ok(fromUrl) ? fromUrl : ok(kept) ? kept : fallback;
}

/** A copy of `prev` with `name` set, or removed when `value` is null or the default. Every other param stays. */
export function withParam(prev: URLSearchParams, name: string, value: string | null, fallback?: string): URLSearchParams {
  const p = new URLSearchParams(prev);
  if (value === null || value === "" || value === fallback) p.delete(name);
  else p.set(name, value);
  return p;
}

/** One piece of screen state in ?name=. Defaults stay out of the URL. */
export function useUrlState<T extends string>(name: string, fallback: NoInfer<T>, opts: Opts<T> = {}): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const { allowed, remember, push } = opts;
  const value = pickValue(params.get(name), memory.get(remember), fallback, allowed);
  const set = useCallback(
    (next: T) => {
      memory.set(remember, next);
      // Functional form: setSearchParams(obj) would wipe every other param on the page.
      setParams((prev) => withParam(prev, name, next, fallback), { replace: !push });
    },
    [name, fallback, remember, push, setParams],
  );
  return [value, set];
}

/** Multi-select: ?platform=instagram,tiktok. Empty means no param. */
export function useUrlList(name: string, opts: { allowed?: readonly string[] } = {}): [string[], (next: string[]) => void] {
  const [params, setParams] = useSearchParams();
  const value = (params.get(name) ?? "").split(",").filter((v) => v && (!opts.allowed || opts.allowed.includes(v)));
  const set = useCallback(
    (next: string[]) => setParams((prev) => withParam(prev, name, next.join(",")), { replace: true }),
    [name, setParams],
  );
  return [value, set];
}

/**
 * The open item (panel, dialog, drawer): ?post=abc. Opening pushes, so Back closes it on a phone; closing
 * removes the param. An id that is not loaded yet keeps its param and opens when the data arrives.
 */
export function useUrlItem(name: string): [string | null, (id: string) => void, () => void] {
  const [params, setParams] = useSearchParams();
  const id = params.get(name);
  const open = useCallback((next: string) => setParams((prev) => withParam(prev, name, next)), [name, setParams]);
  const close = useCallback(() => setParams((prev) => withParam(prev, name, null), { replace: true }), [name, setParams]);
  return [id, open, close];
}

/**
 * A search box backed by ?name=: typing stays local and reaches the URL 300ms after the last key (replace, so
 * Back is not one step per letter); Back, forward or a link that changes the param refills the box.
 */
export function useUrlSearch(name = "q"): [string, (text: string) => void, string] {
  const [q, setQ] = useUrlState(name, "");
  const [text, setText] = useState(q);
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text, q, setQ]);
  // Only when the param differs from what is typed: refilling on every write would eat a trailing space.
  useEffect(() => setText((cur) => (cur.trim() === q ? cur : q)), [q]);
  return [text, setText, q];
}

/**
 * One write for several params: update({ tab: "news", q: null }). null or "" deletes a param, others stay.
 * Two setters in one click keep only the last: React Router 6.30's functional setSearchParams starts each
 * call from the params of the last render, not from the previous call.
 */
export function useUrlUpdate() {
  const [, setParams] = useSearchParams();
  return useCallback(
    (changes: Record<string, string | null>, opts: { push?: boolean } = {}) =>
      setParams(
        (prev) => Object.entries(changes).reduce((p, [k, v]) => withParam(p, k, v), new URLSearchParams(prev)),
        { replace: !opts.push },
      ),
    [setParams],
  );
}

/** `list` with `v` added, or taken out when it is there: a chip in a multi-select. */
export const toggled = <T extends string>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** A choice among labels ("Estate Planning") that the URL carries as slugs (?topic=estate-planning). null = all. */
export function useUrlLabel<T extends string>(name: string, options: readonly T[]): [T | null, (next: T | null) => void] {
  const [s, set] = useUrlState(name, "", { allowed: options.map(slug) });
  const pick = useCallback((next: T | null) => set(next ? slug(next) : ""), [set]);
  return [options.find((o) => slug(o) === s) ?? null, pick];
}

/** Several labels at once, as a comma list of slugs (?pillar=authority,cta). Empty = all. */
export function useUrlLabels<T extends string>(name: string, options: readonly T[]): [T[], (next: T[]) => void] {
  const [s, set] = useUrlList(name, { allowed: options.map(slug) });
  const pick = useCallback((next: T[]) => set(next.map(slug)), [set]);
  return [options.filter((o) => s.includes(slug(o))), pick];
}

/** An on/off toggle as ?name=only (Saved only). Off = no param. */
export function useUrlFlag(name: string, on = "only"): [boolean, (next: boolean) => void] {
  const [v, set] = useUrlState<string>(name, "", { allowed: [on] });
  return [v === on, useCallback((next: boolean) => set(next ? on : ""), [set, on])];
}

/** A #section link scrolls to that section once the page has drawn it (`ready`), on every tap of the link. */
export function useScrollToHash(ready = true) {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const go = (behavior: ScrollBehavior) =>
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior, block: "start" });
    go("smooth");
    // shortcut: a second landing once late layout (web fonts, pictures) has moved the section; a person who
    // starts scrolling within that 600ms is moved back once. Upgrade to watching the section if that bites.
    const t = window.setTimeout(() => go("auto"), 600);
    return () => window.clearTimeout(t);
  }, [ready, hash, key]);
}
