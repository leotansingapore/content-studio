// Cross-device sync for the app's localStorage workspace.
//
// Every feature in this app persists under a "content-studio-" localStorage
// key. Rather than rewriting each feature against Supabase, this module syncs
// at the storage layer:
//   - on login, pull cloud rows and apply any that are newer than this
//     device's last local write (first sync on a device with data: local wins
//     and is pushed up, so nothing on-device is ever clobbered silently)
//   - patch localStorage.setItem/removeItem so writes to synced keys are
//     debounce-pushed to the cs_user_data table (last write wins)
//   - keys waiting to be sent are saved on the device too, so a rejected save,
//     an offline spell or a closed tab is retried rather than lost
//   - nothing is pushed until a pull has succeeded, so a failed pull can't
//     overwrite newer data from another device
//   - keys naming a different user id are never uploaded (shared browsers)
//
// Callers never change: draftHistory, contentPlan, coach, savedItems, etc.
// keep reading/writing localStorage as before.

import { supabase } from "@/lib/supabase";
import { listMerger, type SyncBase, type SyncMerger } from "@/lib/syncMerge";

const SYNC_PREFIX = "content-studio-";
const META_KEY = "cs-sync-meta"; // deliberately outside SYNC_PREFIX
const PENDING_PREFIX = "cs-sync-pending-"; // + user id; also outside SYNC_PREFIX
const PUSH_DEBOUNCE_MS = 800;
const RETRY_DELAYS_MS = [2_000, 10_000, 30_000, 60_000];
const SIGN_OUT_WAIT_MS = 3_000;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type Meta = Record<string, string>; // key -> ISO timestamp of last local write

// Keys merged item by item instead of last write wins (posts lists: syncMerge.ts), registered by their owners
// (draftHistory). Each keeps, on this device only, what it last knew the cloud held (`cs-sync-base-<key>`).
const MERGERS: { prefix: string; merger: SyncMerger }[] = [];
const BASE_PREFIX = "cs-sync-base-"; // outside SYNC_PREFIX: this device's own knowledge, never uploaded
const REFRESH_EVERY_MS = 10_000;

/** Merge every key starting with `prefix` item by item from now on. */
export function registerSyncMerge(prefix: string, merger: SyncMerger) {
  if (!MERGERS.some((m) => m.prefix === prefix)) MERGERS.push({ prefix, merger });
}
const mergerFor = (key: string) => MERGERS.find((m) => key.startsWith(m.prefix))?.merger;

// What was removed, and when (Leo, 6 Nov: deleted plans and removed brands came back from any device still holding a
// copy, since the pull pushed up every key the cloud lacked). One synced list per account, merged like posts; a device
// drops its copy of a key removed after it last wrote it, instead of uploading it again, and undoes an old build's
// re-upload (a row stamped before the removal). Entries go after 90 days, 1,000 at most.
type Tomb = { id: string; at: string };
const TOMB_PREFIX = "content-studio-tombstones-";
const TOMB_DAYS = 90;
const TOMB_MAX = 1_000;
const pruneTombs = (list: Tomb[]) => {
  const since = Date.now() - TOMB_DAYS * 86_400_000;
  return list.filter((t) => new Date(t.at).getTime() >= since).slice(0, TOMB_MAX);
};
registerSyncMerge(TOMB_PREFIX, listMerger<Tomb>({ after: pruneTombs }));
// The brand list (profiles.ts): a brand added on one device and removed on another both reach every device.
registerSyncMerge("content-studio-profiles-", listMerger<{ id: string }>());

export type SyncDecision = "apply-cloud" | "push-local" | "noop";

// Pure decision logic (unit-tested). localValue/metaTs describe this device,
// cloudTs the server row, and unsent says this device has a write for the key
// that never reached the cloud. Rules:
//   - unsent local write: newest timestamp wins
//   - nothing local: take the cloud copy
//   - local data but never synced here: keep local, push it up
//   - both synced before: take the cloud copy only if it is newer
export function decideSync(
  localValue: string | null,
  metaTs: string | null,
  cloudTs: string,
  unsent = false,
): SyncDecision {
  const cloudNewer =
    metaTs !== null && new Date(cloudTs).getTime() > new Date(metaTs).getTime();
  if (unsent) return cloudNewer ? "apply-cloud" : "push-local";
  if (localValue === null) return "apply-cloud";
  if (!metaTs) return "push-local";
  return cloudNewer ? "apply-cloud" : "noop";
}

// True for a synced key that belongs to this user. Per-user keys end in the
// user id; a key naming a different id was left by someone else who used this
// browser and must not be uploaded into this account.
export function isSyncedKeyFor(key: string, userId: string): boolean {
  if (!key.startsWith(SYNC_PREFIX)) return false;
  const ids = key.match(UUID_RE) ?? [];
  // the old per-video captions key named no user: it stays put until platformCaptions moves it to its owner's key
  if (!ids.length && key.startsWith("content-studio-video-captions-")) return false;
  return ids.every((id) => id.toLowerCase() === userId.toLowerCase());
}

export interface SyncRow {
  key: string;
  data: string;
  updated_at: string;
}

type Outcome = { error: unknown };

export interface SyncBackend {
  /** Every row of this user's, or only the named keys. */
  pull(keys?: string[]): PromiseLike<{ data: SyncRow[] | null; error: unknown }>;
  upsert(rows: SyncRow[]): PromiseLike<Outcome>;
  remove(keys: string[]): PromiseLike<Outcome>;
  /** Every row whose key starts with one of these (the merged lists, read again when a tab comes back). */
  pullLike?(prefixes: string[]): PromiseLike<{ data: SyncRow[] | null; error: unknown }>;
  /** Write the row only if the cloud's still has the stamp `seen` (null: no row yet). Merged keys save this way. */
  swap?(row: SyncRow, seen: string | null): PromiseLike<"ok" | "conflict" | Outcome>;
}

// Unpatched storage calls: the engine's own reads and writes must not re-queue.
export interface SyncStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CloudSync {
  userId: string;
  /** First pull; resolves after one attempt and keeps retrying in the background. */
  start(): Promise<void>;
  /** Call after the app writes or removes a key. */
  noteWrite(key: string): void;
  /** The network came back: pull or push now instead of waiting for the backoff. */
  retryNow(): void;
  flush(): Promise<void>;
  /** Pull these keys again after the first pull, for rows a server job rewrites while the app is open. */
  refresh(keys: string[]): Promise<void>;
  /** Pull and merge the merged keys again (a tab came back), at most every 10 s. */
  refreshMerged(): Promise<void>;
  /** The stamp of the key's row this device last wrote or took, or null: a cloud row with that stamp is nothing new. */
  syncedAt(key: string): string | null;
  /** Send what's pending once, then stop. Anything unsent stays saved on the device. */
  stop(): Promise<void>;
}

function readJson<T>(storage: SyncStorage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: SyncStorage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable; sync degrades to session-only
  }
}

async function succeeded(call: () => PromiseLike<Outcome>): Promise<boolean> {
  try {
    const { error } = await call();
    return !error;
  } catch {
    return false;
  }
}

export function createCloudSync(
  userId: string,
  storage: SyncStorage,
  backend: SyncBackend,
): CloudSync {
  const pendingKey = PENDING_PREFIX + userId;
  const meta = readJson<Meta>(storage, META_KEY, {});
  // Keys changed on this device that the cloud hasn't confirmed yet.
  const pending = new Set<string>(readJson<string[]>(storage, pendingKey, []));
  let sending: string[] = [];
  let pulled = false;
  let pulling = false;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let dirtyDuringFlight = false;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let pullTimer: ReturnType<typeof setTimeout> | undefined;
  let pushFailures = 0;
  let pullFailures = 0;

  const backoff = (failures: number) =>
    RETRY_DELAYS_MS[Math.min(failures - 1, RETRY_DELAYS_MS.length - 1)];

  const loadBase = (key: string) => readJson<SyncBase | null>(storage, BASE_PREFIX + key, null);
  const saveBase = (key: string, base: SyncBase | null) => {
    if (base) writeJson(storage, BASE_PREFIX + key, base);
  };
  // this device wrote the key after the cloud's row was stamped: its copy wins an item both sides changed
  const localNewer = (key: string, cloudTs: string) =>
    !!meta[key] && new Date(meta[key]).getTime() > new Date(cloudTs).getTime();
  /** Merges the cloud's copy into this device's, writing the result here; null when the merger can't. */
  const tombKey = TOMB_PREFIX + userId;
  const tombs = (): Tomb[] => {
    const list = readJson<unknown>(storage, tombKey, []);
    return Array.isArray(list) ? (list as Tomb[]).filter((t) => t && typeof t.id === "string" && typeof t.at === "string") : [];
  };
  /** When the key was removed, if it was removed after this device last wrote it: its copy here is stale. */
  const removedAt = (key: string, list = tombs()): string | null => {
    if (key === tombKey) return null;
    const at = list.find((t) => t.id === key)?.at;
    // written at or after the removal (a reset that removes and writes in one go): this copy is the new one
    return at && !(meta[key] && new Date(meta[key]).getTime() >= new Date(at).getTime()) ? at : null;
  };
  /** Takes away this device's copy of a removed key, without recording a new removal. */
  const dropRemoved = (key: string) => {
    try {
      storage.removeItem(key);
      storage.removeItem(BASE_PREFIX + key);
    } catch {
      // unavailable storage: nothing to drop
    }
    delete meta[key];
    pending.delete(key);
    mergerFor(key)?.changed?.(key);
  };
  /** Every key removed elsewhere since this device wrote it goes here too. */
  const dropAllRemoved = () => {
    const list = tombs();
    if (!list.length) return;
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && isSyncedKeyFor(key, userId) && removedAt(key, list)) dropRemoved(key);
    }
  };
  /** Records the app's removal of `key` in the synced list, to go up with it. */
  const noteRemoval = (key: string) => {
    const at = new Date().toISOString();
    writeJson(storage, tombKey, pruneTombs([{ id: key, at }, ...tombs().filter((t) => t.id !== key)]));
    meta[tombKey] = at;
    pending.add(tombKey);
  };

  const mergeIn = (key: string, merger: SyncMerger, local: string, row: SyncRow): string | null => {
    const merged = merger.merge(local, row.data, loadBase(key), localNewer(key, row.updated_at));
    if (merged !== null && merged !== local) {
      try {
        storage.setItem(key, merged);
      } catch {
        return null; // storage full: this device keeps its copy, and the whole-value rules decide as before
      }
      merger.changed?.(key);
    }
    return merged;
  };

  const savePending = () => {
    const keys = [...new Set([...pending, ...sending])];
    if (keys.length) {
      writeJson(storage, pendingKey, keys);
    } else {
      try {
        storage.removeItem(pendingKey);
      } catch {
        // unavailable storage: nothing to clear
      }
    }
  };

  const schedulePush = (ms: number) => {
    clearTimeout(pushTimer);
    if (!stopped) pushTimer = setTimeout(() => void flush(), ms);
  };

  // A merged key reads the cloud's copy, merges into it and writes only if the cloud still holds what it merged
  // (swap): a blind write would drop what another device saved in between. A lost race reads and merges again.
  const sendMerged = async (key: string, merger: SyncMerger): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      let row: SyncRow | undefined;
      try {
        const { data, error } = await backend.pull([key]);
        if (error || !data) return false;
        row = data.find((r) => r.key === key);
      } catch {
        return false;
      }
      // read after the wait, so an edit made meanwhile is in what goes up
      const local = storage.getItem(key);
      if (local === null) return succeeded(() => backend.remove([key]));
      const value = row && row.data !== local ? (mergeIn(key, merger, local, row) ?? local) : local;
      // what the cloud held is known now, whether or not the write below lands: a retry must not read a post deleted
      // there meanwhile as one added here
      if (row) saveBase(key, merger.base(row.data));
      if (row && value === row.data) {
        meta[key] = row.updated_at;
        saveBase(key, merger.base(value));
        return true;
      }
      const stamp = new Date().toISOString();
      let outcome: Awaited<ReturnType<NonNullable<SyncBackend["swap"]>>>;
      try {
        outcome = await backend.swap!({ key, data: value, updated_at: stamp }, row?.updated_at ?? null);
      } catch {
        return false;
      }
      if (outcome === "ok") {
        meta[key] = stamp;
        saveBase(key, merger.base(value));
        return true;
      }
      if (outcome !== "conflict") return false;
    }
    return false;
  };

  const send = async (keys: string[]) => {
    const failed: string[] = [];
    const merged = backend.swap ? keys.filter((key) => mergerFor(key) && storage.getItem(key) !== null) : [];
    for (const key of merged) if (!(await sendMerged(key, mergerFor(key)!))) failed.push(key);
    const now = new Date().toISOString();
    const upserts: SyncRow[] = [];
    const deletes: string[] = [];
    for (const key of keys.filter((k) => !merged.includes(k))) {
      const data = storage.getItem(key);
      // Stamp rows with when they were written here, not when they were sent,
      // so a delayed retry doesn't beat edits made on another device since.
      if (data === null) deletes.push(key);
      else upserts.push({ key, data, updated_at: meta[key] ?? now });
    }

    if (upserts.length && !(await succeeded(() => backend.upsert(upserts)))) {
      failed.push(...upserts.map((row) => row.key));
    }
    if (deletes.length && !(await succeeded(() => backend.remove(deletes)))) {
      failed.push(...deletes);
    }

    for (const row of upserts) {
      if (!failed.includes(row.key) && !meta[row.key]) meta[row.key] = row.updated_at;
    }
    writeJson(storage, META_KEY, meta);
    failed.forEach((key) => pending.add(key));
    sending = [];
    savePending();
    inFlight = null;

    if (failed.length) {
      pushFailures += 1;
      schedulePush(backoff(pushFailures));
    } else {
      pushFailures = 0;
      if (dirtyDuringFlight && pending.size) schedulePush(PUSH_DEBOUNCE_MS);
    }
    dirtyDuringFlight = false;
  };

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (!pulled || pending.size === 0) return Promise.resolve();
    clearTimeout(pushTimer);
    sending = [...pending];
    pending.clear();
    inFlight = send(sending);
    return inFlight;
  };

  const applyRow = (row: SyncRow) => {
    if (!isSyncedKeyFor(row.key, userId)) return;
    const gone = row.key !== tombKey && tombs().find((t) => t.id === row.key)?.at;
    if (gone && new Date(row.updated_at).getTime() < new Date(gone).getTime() && removedAt(row.key)) {
      dropRemoved(row.key);
      pending.add(row.key); // nothing here, so the send removes the cloud row again
      return;
    }
    const merger = mergerFor(row.key);
    const local = storage.getItem(row.key);
    // synced here before the merge existed and nothing unsent: this copy is what the cloud held, so it is the base
    // (without it the first merge reads nothing as deleted, and posts deleted elsewhere come back)
    if (merger && local !== null && !loadBase(row.key) && meta[row.key] && !pending.has(row.key) && !sending.includes(row.key))
      saveBase(row.key, merger.base(local));
    if (merger && local !== null) {
      // both copies kept, item by item; what differs from the cloud goes back up
      const merged = local === row.data ? local : mergeIn(row.key, merger, local, row);
      if (merged !== null) {
        saveBase(row.key, merger.base(row.data));
        if (merged === row.data) {
          meta[row.key] = row.updated_at;
          pending.delete(row.key);
        } else pending.add(row.key);
        return;
      }
    }
    const decision = decideSync(
      storage.getItem(row.key),
      meta[row.key] ?? null,
      row.updated_at,
      pending.has(row.key),
    );
    if (decision === "apply-cloud") {
      storage.setItem(row.key, row.data);
      meta[row.key] = row.updated_at;
      pending.delete(row.key);
      if (merger) {
        saveBase(row.key, merger.base(row.data));
        merger.changed?.(row.key);
      }
    } else if (decision === "push-local") {
      pending.add(row.key);
    }
  };

  const pull = async (): Promise<boolean> => {
    let rows: SyncRow[];
    try {
      const { data, error } = await backend.pull();
      if (error || !data) return false;
      rows = data;
    } catch {
      return false;
    }

    const cloudKeys = new Set<string>();
    // the removals first, so every other row is read against them
    for (const row of [...rows].sort((x, y) => Number(y.key === tombKey) - Number(x.key === tombKey))) {
      cloudKeys.add(row.key);
      applyRow(row);
    }
    // Local synced keys the cloud has never seen: push them up, unless they were removed since this device wrote them.
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (!key || cloudKeys.has(key) || !isSyncedKeyFor(key, userId)) continue;
      if (removedAt(key)) dropRemoved(key);
      else pending.add(key);
    }

    writeJson(storage, META_KEY, meta);
    savePending();
    pulled = true;
    if (pending.size) schedulePush(PUSH_DEBOUNCE_MS);
    return true;
  };

  const pullUntilDone = async () => {
    clearTimeout(pullTimer);
    if (stopped || pulled || pulling) return;
    pulling = true;
    const ok = await pull();
    pulling = false;
    if (ok) {
      pullFailures = 0;
      return;
    }
    pullFailures += 1;
    if (!stopped) pullTimer = setTimeout(() => void pullUntilDone(), backoff(pullFailures));
  };

  const noteWrite = (key: string) => {
    if (stopped || !isSyncedKeyFor(key, userId)) return;
    if (key !== tombKey && storage.getItem(key) === null) noteRemoval(key);
    meta[key] = new Date().toISOString();
    writeJson(storage, META_KEY, meta);
    pending.add(key);
    savePending();
    if (inFlight) dirtyDuringFlight = true;
    else if (pulled) schedulePush(PUSH_DEBOUNCE_MS);
  };

  // Same rules as the first pull, for the rows asked for only; other keys are left alone.
  const refreshRows = async (read: () => PromiseLike<{ data: SyncRow[] | null; error: unknown }>, wanted: (key: string) => boolean) => {
    try {
      const { data, error } = await read();
      if (error || !data || stopped) return;
      data
        .filter((row) => wanted(row.key))
        .sort((x, y) => Number(y.key === tombKey) - Number(x.key === tombKey))
        .forEach(applyRow);
      dropAllRemoved();
    } catch {
      return; // offline: the next refresh or reload catches up
    }
    writeJson(storage, META_KEY, meta);
    savePending();
    if (pending.size) schedulePush(PUSH_DEBOUNCE_MS);
  };
  const refresh = async (keys: string[]) => {
    if (stopped || !pulled || !keys.length) return;
    await refreshRows(() => backend.pull(keys), (key) => keys.includes(key));
  };

  let lastMergedRefresh = 0;
  const refreshMerged = () => {
    if (!pulled || stopped || Date.now() - lastMergedRefresh < REFRESH_EVERY_MS) return Promise.resolve();
    lastMergedRefresh = Date.now();
    // by prefix, so a list another device made since (a new brand's posts) arrives too
    if (backend.pullLike) return refreshRows(() => backend.pullLike!(MERGERS.map((m) => m.prefix)), (key) => !!mergerFor(key));
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && mergerFor(key) && isSyncedKeyFor(key, userId)) keys.push(key);
    }
    return refresh(keys);
  };

  return {
    userId,
    start: pullUntilDone,
    refresh,
    refreshMerged,
    syncedAt: (key) => meta[key] ?? null,
    noteWrite,
    retryNow: () => {
      if (pulled) {
        pushFailures = 0;
        void flush();
      } else {
        pullFailures = 0;
        void pullUntilDone();
      }
    },
    flush,
    stop: async () => {
      if (stopped) return;
      if (inFlight) await inFlight;
      await flush();
      stopped = true;
      clearTimeout(pushTimer);
      clearTimeout(pullTimer);
    },
  };
}

function supabaseBackend(userId: string): SyncBackend {
  const table = () => supabase.from("cs_user_data");
  return {
    pull: (keys) => {
      const rows = table().select("key,data,updated_at").eq("user_id", userId);
      return keys ? rows.in("key", keys) : rows;
    },
    upsert: (rows) =>
      table().upsert(
        rows.map((row) => ({ user_id: userId, ...row })),
        { onConflict: "user_id,key" },
      ),
    remove: (keys) => table().delete().eq("user_id", userId).in("key", keys),
    pullLike: (prefixes) =>
      table()
        .select("key,data,updated_at")
        .eq("user_id", userId)
        .or(prefixes.map((p) => `key.like.${p}*`).join(",")),
    swap: async (row, seen) => {
      if (seen === null) {
        const { error } = await table().insert({ user_id: userId, ...row });
        // another device made the row first: read it and merge
        return !error ? "ok" : (error as { code?: string }).code === "23505" ? "conflict" : { error };
      }
      const { data, error } = await table()
        .update({ data: row.data, updated_at: row.updated_at })
        .eq("user_id", userId)
        .eq("key", row.key)
        .eq("updated_at", seen)
        .select("key");
      if (error) return { error };
      return data && data.length ? "ok" : "conflict";
    },
  };
}

let active: CloudSync | null = null;
let rawStorage: SyncStorage | null = null;
// Starts and stops run one at a time, so a quick sign-out/sign-in can't overlap.
let chain: Promise<void> = Promise.resolve();

function installStoragePatch(): SyncStorage {
  const storage = window.localStorage;
  const rawSet = storage.setItem.bind(storage);
  const rawRemove = storage.removeItem.bind(storage);
  storage.setItem = (key: string, value: string) => {
    rawSet(key, value);
    active?.noteWrite(key);
  };
  storage.removeItem = (key: string) => {
    rawRemove(key);
    active?.noteWrite(key);
  };
  window.addEventListener("online", () => active?.retryNow());
  // Best-effort send when the tab hides or closes; unsent keys are saved either way.
  // ...and a tab coming back merges in what other devices saved meanwhile (posts lists)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void active?.flush();
    else void active?.refreshMerged();
  });
  return {
    get length() {
      return storage.length;
    },
    key: (index) => storage.key(index),
    getItem: (key) => storage.getItem(key),
    setItem: rawSet,
    removeItem: rawRemove,
  };
}

async function stopActive() {
  const engine = active;
  active = null;
  if (!engine) return;
  // Don't hold up sign-out on a slow network; unsent keys stay saved on this device.
  await Promise.race([
    engine.stop(),
    new Promise((resolve) => setTimeout(resolve, SIGN_OUT_WAIT_MS)),
  ]);
}

export function initCloudSync(userId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  chain = chain
    .catch(() => undefined)
    .then(async () => {
      if (active?.userId === userId) return;
      await stopActive();
      rawStorage ??= installStoragePatch();
      const engine = createCloudSync(userId, rawStorage, supabaseBackend(userId));
      active = engine;
      await engine.start();
    });
  return chain;
}

/** Pull these keys again now (a server job changed them); resolves once they are in localStorage. */
export function refreshCloudKeys(keys: string[]): Promise<void> {
  return active?.refresh(keys) ?? Promise.resolve();
}

/** This device's stamp for a synced key (CloudSync.syncedAt), or null before sync starts. */
export const cloudSyncedAt = (key: string): string | null => active?.syncedAt(key) ?? null;

/** Send pending changes (briefly) and detach sync from the signed-out user. */
export function stopCloudSync(): Promise<void> {
  chain = chain.catch(() => undefined).then(stopActive);
  return chain;
}
