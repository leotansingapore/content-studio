// A shared brand's sync on a member's device (docs/shared-brands.md, "Sync on a member's device"). The owner's own
// devices keep cloudSync's rules; this one is simpler because the server is the only copy that counts:
//   - it owns exactly the brand's allow-listed keys (sharedBrands.ts), which the member's main sync never touches
//   - every save is compare-and-set against the stamp this device last saw (037 cs_brand_swap), so a save made on an
//     old copy never overwrites a newer one: posts merge one by one and try again, any other key takes the cloud's
//     copy and the person is told
//   - read-only keys are pulled, never sent
//   - its own state (seen stamps, unsent keys) is stored per user and brand, and goes with the brand's copies on
//     teardown, through the raw storage calls, so nothing is sent as a deletion
// No React, no Supabase import: cloudSync wires it to the patched localStorage and to brandBackend.

import type { SyncRow, SyncStorage } from "@/lib/cloudSync";
import type { SyncBase, SyncMerger } from "@/lib/syncMerge";
import { brandKeys, scopeOf, type SharedBrand } from "@/lib/sharedBrands";

export interface BrandBackend {
  /** The brand's allow-listed rows, or only the keys asked for (037 cs_brand_rows). */
  rows(keys?: string[]): PromiseLike<{ data: SyncRow[] | null; error: unknown }>;
  /** Writes if the row's stamp is still `seen` (null: no row yet). data: the stamp written, or null when someone saved first. */
  swap(key: string, data: string, stamp: string, seen: string | null): PromiseLike<{ data: string | null; error: unknown }>;
  /** Removes if the row's stamp is still `seen`. data: true when gone, false when someone saved it since. */
  drop(key: string, seen: string): PromiseLike<{ data: boolean | null; error: unknown }>;
}

export interface BrandSync {
  brand: string;
  owns(key: string): boolean;
  /** First pull: resolves after one attempt and keeps trying in the background. */
  start(): Promise<void>;
  noteWrite(key: string): void;
  /** Pull every key again (a tab came back), at most every 10 s unless forced. */
  refresh(force?: boolean): Promise<void>;
  flush(): Promise<void>;
  retryNow(): void;
  /** Send what's waiting once, then stop. */
  stop(): Promise<void>;
  /** Stop, and remove this device's copies of the brand, their merge bases and this sync's own state. */
  teardown(): void;
  pulled(): boolean;
  /** Changes made here not yet confirmed by the server. */
  waiting(): number;
}

const STATE_PREFIX = "cs-brand-sync-"; // + userId~brandId, outside the sync prefix
const BASE_PREFIX = "cs-sync-base-"; // cloudSync's: this device's own knowledge of a merged key
const DEBOUNCE_MS = 800;
const RETRY_MS = [2_000, 10_000, 30_000, 60_000];
const REFRESH_EVERY_MS = 10_000;
// what the server refuses for good: retrying can't help, so the cloud's copy is taken
const PERMANENT = /key_not_shared|too_big|not_json|unsafe_link|held_post/;

type State = { seen: Record<string, string>; pending: string[]; wrote: Record<string, string>; pulled: boolean };
const stateKey = (userId: string, brand: string) => `${STATE_PREFIX}${userId}~${brand}`;

function readState(storage: Pick<SyncStorage, "getItem">, key: string): State {
  try {
    const s = JSON.parse(storage.getItem(key) ?? "null") as Partial<State> | null;
    return {
      seen: s?.seen && typeof s.seen === "object" ? s.seen : {},
      pending: Array.isArray(s?.pending) ? s!.pending.filter((k) => typeof k === "string") : [],
      wrote: s?.wrote && typeof s.wrote === "object" ? s.wrote : {},
      pulled: s?.pulled === true,
    };
  } catch {
    return { seen: {}, pending: [], wrote: {}, pulled: false };
  }
}

/** Whether this device has pulled the brand at least once: until then it isn't opened (nobody types into an empty copy). */
export const brandSyncReady = (userId: string, brand: string, storage: Pick<SyncStorage, "getItem">): boolean => readState(storage, stateKey(userId, brand)).pulled;

type Post = { id?: unknown; zernio?: { postId?: string; status?: string } };
// zernioOutbox.ts zernioHolds, kept here so the sync doesn't pull in the posting code (brandSync.test.ts holds the two together)
const holds = (d: Post) => !!d?.zernio?.postId && !["published", "partial", "failed", "cancelled"].includes(d.zernio.status ?? "");

/** `value` with every post Zernio holds in `cloud` put back exactly as the cloud has it (037 refuses any change to one). */
export function keepHeld(value: string, cloud: string): string {
  try {
    const mine = JSON.parse(value) as Post[];
    const theirs = JSON.parse(cloud) as Post[];
    if (!Array.isArray(mine) || !Array.isArray(theirs)) return value;
    const held = theirs.filter(holds);
    if (!held.length) return value;
    const out = mine.map((d) => held.find((h) => h.id === d?.id) ?? d);
    held.forEach((h) => {
      if (!out.some((d) => d?.id === h.id)) out.splice(Math.min(theirs.indexOf(h), out.length), 0, h);
    });
    return JSON.stringify(out);
  } catch {
    return value;
  }
}

export function createBrandSync(opts: {
  userId: string;
  brand: SharedBrand;
  storage: SyncStorage;
  backend: BrandBackend;
  mergerFor: (key: string) => SyncMerger | undefined;
  /** A save of `key` didn't land (someone saved first, or the server refused it): the cloud's copy is now here. */
  onLost?: (key: string, why: string) => void;
  /** The server says this account is no longer on the brand. */
  onGone?: () => void;
  now?: () => string;
}): BrandSync {
  const { userId, brand, storage, backend, mergerFor } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  const scope = scopeOf(brand.owner, brand.profile);
  const writable = new Set(brandKeys(scope, true));
  const all = new Set(brandKeys(scope, false));
  const key = stateKey(userId, brand.brand);
  const st = readState(storage, key);
  const pending = new Set(st.pending);
  // keys another tab of this device may have confirmed or queued since this one read the state
  const settled = new Set<string>();
  let pulled = st.pulled;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let dirty = false;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let pullTimer: ReturnType<typeof setTimeout> | undefined;
  let pushFailures = 0;
  let pullFailures = 0;
  let lastRefresh = 0;

  const backoff = (n: number) => RETRY_MS[Math.min(n - 1, RETRY_MS.length - 1)];
  const save = () => {
    // pending is the union with what other tabs queued, minus what this tab saw land
    const disk = readState(storage, key);
    const out = [...new Set([...disk.pending.filter((k) => !settled.has(k)), ...pending])];
    settled.clear();
    try {
      storage.setItem(key, JSON.stringify({ seen: st.seen, pending: out, wrote: st.wrote, pulled } satisfies State));
    } catch {
      // storage full: the state lives in memory until the next save
    }
  };
  const reloadPending = () => readState(storage, key).pending.forEach((k) => all.has(k) && pending.add(k));
  const loadBase = (k: string): SyncBase | null => {
    try {
      return JSON.parse(storage.getItem(BASE_PREFIX + k) ?? "null");
    } catch {
      return null;
    }
  };
  const saveBase = (k: string, base: SyncBase | null) => {
    try {
      if (base) storage.setItem(BASE_PREFIX + k, JSON.stringify(base));
    } catch {
      // nothing: the next merge reads without a base, which only adds
    }
  };
  const take = (row: SyncRow) => {
    try {
      storage.setItem(row.key, row.data);
    } catch {
      return; // out of room: this device keeps what it has
    }
    st.seen[row.key] = row.updated_at;
    const merger = mergerFor(row.key);
    if (merger) saveBase(row.key, merger.base(row.data));
    merger?.changed?.(row.key);
  };
  const forget = (k: string) => {
    storage.removeItem(k);
    storage.removeItem(BASE_PREFIX + k);
    delete st.seen[k];
    mergerFor(k)?.changed?.(k);
  };
  const schedule = (ms: number) => {
    clearTimeout(pushTimer);
    if (!stopped) pushTimer = setTimeout(() => void flush(), ms);
  };

  const pull = async (): Promise<boolean> => {
    let rows: SyncRow[];
    try {
      const { data, error } = await backend.rows();
      if (error || !data) {
        if (/not_on_brand/.test(String((error as { message?: string } | null)?.message ?? ""))) gone();
        return false;
      }
      rows = data.filter((r) => all.has(r.key));
    } catch {
      return false;
    }
    if (stopped) return false;
    reloadPending();
    const cloud = new Map(rows.map((r) => [r.key, r]));
    for (const row of cloud.values()) {
      // a change waiting here is sent against the stamp it was made on; the send settles it
      if (pending.has(row.key) && writable.has(row.key)) continue;
      if (st.seen[row.key] !== row.updated_at || storage.getItem(row.key) === null) take(row);
    }
    // here but not in the cloud: removed elsewhere, or a leftover. Only a change made here and not yet sent stays.
    for (const k of all) {
      if (cloud.has(k)) continue;
      if (pending.has(k) && writable.has(k)) {
        if (storage.getItem(k) === null) pending.delete(k); // a removal of something the cloud doesn't hold
        continue;
      }
      if (storage.getItem(k) !== null || st.seen[k]) forget(k);
    }
    pulled = true;
    save();
    if (pending.size) schedule(DEBOUNCE_MS);
    return true;
  };

  const gone = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(pushTimer);
    clearTimeout(pullTimer);
    opts.onGone?.();
  };

  /** Someone saved first, or the server refused the save: take the cloud's copy and say so. */
  const lost = async (k: string, why: string): Promise<"done" | "retry"> => {
    try {
      const { data, error } = await backend.rows([k]);
      if (error || !data) return "retry";
      const row = data.find((r) => r.key === k);
      if (row) take(row);
      else if (storage.getItem(k) !== null) forget(k);
    } catch {
      return "retry";
    }
    opts.onLost?.(k, why);
    return "done";
  };
  const refused = (k: string, error: unknown): Promise<"done" | "retry"> | "done" | "retry" => {
    const msg = String((error as { message?: string } | null)?.message ?? "");
    if (/not_on_brand/.test(msg)) {
      gone();
      return "done";
    }
    return PERMANENT.test(msg) ? lost(k, msg.match(PERMANENT)![0]) : "retry";
  };
  const newer = (k: string, cloudTs: string) => !!st.wrote[k] && Date.parse(st.wrote[k]) > Date.parse(cloudTs);

  const sendOne = async (k: string): Promise<"done" | "retry"> => {
    if (!writable.has(k)) return "done";
    try {
      if (storage.getItem(k) === null) {
        const was = st.seen[k];
        if (!was) return "done";
        const { data, error } = await backend.drop(k, was);
        if (error) return refused(k, error);
        if (data === true) {
          delete st.seen[k];
          storage.removeItem(BASE_PREFIX + k);
          return "done";
        }
        return lost(k, "conflict");
      }
      const merger = mergerFor(k);
      for (let attempt = 0; attempt < 3; attempt++) {
        const mine = storage.getItem(k);
        if (mine === null) return "retry"; // removed meanwhile: the next send drops it
        let value = mine;
        let seen = st.seen[k] ?? null;
        if (merger) {
          // posts: read the cloud's copy, merge into it, keep every post Zernio holds as the cloud has it
          const { data, error } = await backend.rows([k]);
          if (error || !data) return refused(k, error);
          const row = data.find((r) => r.key === k);
          seen = row?.updated_at ?? null;
          if (row) {
            if (row.data !== mine) value = merger.merge(mine, row.data, loadBase(k), newer(k, row.updated_at)) ?? mine;
            value = keepHeld(value, row.data);
            saveBase(k, merger.base(row.data));
          }
        }
        const { data: written, error } = await backend.swap(k, value, now(), seen);
        if (error) return refused(k, error);
        if (written) {
          st.seen[k] = written;
          if (merger) {
            saveBase(k, merger.base(value));
            // only over the copy that was merged: an edit made during the save stays, and goes next
            if (value !== mine && storage.getItem(k) === mine) {
              storage.setItem(k, value);
              merger.changed?.(k);
            }
          }
          return "done";
        }
        if (!merger) return lost(k, "conflict");
      }
      return "retry";
    } catch {
      return "retry";
    }
  };

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (!pulled || stopped || !pending.size) return Promise.resolve();
    clearTimeout(pushTimer);
    const keys = [...pending];
    pending.clear();
    inFlight = (async () => {
      let retry = false;
      for (const k of keys) {
        if (stopped) break;
        if ((await sendOne(k)) === "retry") {
          pending.add(k);
          retry = true;
        } else settled.add(k);
      }
      save();
      inFlight = null;
      if (stopped) return;
      if (retry) schedule(backoff(++pushFailures));
      else {
        pushFailures = 0;
        if (dirty && pending.size) schedule(DEBOUNCE_MS);
      }
      dirty = false;
    })();
    return inFlight;
  };

  const start = async () => {
    clearTimeout(pullTimer);
    if (stopped) return;
    if (await pull()) {
      pullFailures = 0;
      return;
    }
    if (!stopped) pullTimer = setTimeout(() => void start(), backoff(++pullFailures));
  };

  return {
    brand: brand.brand,
    owns: (k) => all.has(k),
    start,
    noteWrite(k) {
      if (stopped || !all.has(k)) return;
      if (!writable.has(k)) {
        // read-only here: forget the stamp so the next pull puts the cloud's copy back
        delete st.seen[k];
        save();
        return;
      }
      pending.add(k);
      st.wrote[k] = now();
      save();
      if (inFlight) dirty = true;
      else if (pulled) schedule(DEBOUNCE_MS);
    },
    async refresh(force = false) {
      if (stopped || (!force && Date.now() - lastRefresh < REFRESH_EVERY_MS)) return;
      lastRefresh = Date.now();
      if (!pulled) return start();
      await pull();
    },
    flush,
    retryNow() {
      pushFailures = 0;
      if (pulled) void flush();
      else void start();
    },
    async stop() {
      if (inFlight) await inFlight;
      await flush();
      stopped = true;
      clearTimeout(pushTimer);
      clearTimeout(pullTimer);
    },
    teardown() {
      stopped = true;
      clearTimeout(pushTimer);
      clearTimeout(pullTimer);
      for (const k of all) {
        storage.removeItem(k);
        storage.removeItem(BASE_PREFIX + k);
      }
      storage.removeItem(key);
    },
    pulled: () => pulled,
    waiting: () => pending.size,
  };
}
