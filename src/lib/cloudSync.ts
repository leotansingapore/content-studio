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

const SYNC_PREFIX = "content-studio-";
const META_KEY = "cs-sync-meta"; // deliberately outside SYNC_PREFIX
const PENDING_PREFIX = "cs-sync-pending-"; // + user id; also outside SYNC_PREFIX
const PUSH_DEBOUNCE_MS = 800;
const RETRY_DELAYS_MS = [2_000, 10_000, 30_000, 60_000];
const SIGN_OUT_WAIT_MS = 3_000;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type Meta = Record<string, string>; // key -> ISO timestamp of last local write

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
  return ids.every((id) => id.toLowerCase() === userId.toLowerCase());
}

export interface SyncRow {
  key: string;
  data: string;
  updated_at: string;
}

type Outcome = { error: unknown };

export interface SyncBackend {
  pull(): PromiseLike<{ data: SyncRow[] | null; error: unknown }>;
  upsert(rows: SyncRow[]): PromiseLike<Outcome>;
  remove(keys: string[]): PromiseLike<Outcome>;
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

  const send = async (keys: string[]) => {
    const now = new Date().toISOString();
    const upserts: SyncRow[] = [];
    const deletes: string[] = [];
    for (const key of keys) {
      const data = storage.getItem(key);
      // Stamp rows with when they were written here, not when they were sent,
      // so a delayed retry doesn't beat edits made on another device since.
      if (data === null) deletes.push(key);
      else upserts.push({ key, data, updated_at: meta[key] ?? now });
    }

    const failed: string[] = [];
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
    for (const row of rows) {
      cloudKeys.add(row.key);
      if (!isSyncedKeyFor(row.key, userId)) continue;
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
      } else if (decision === "push-local") {
        pending.add(row.key);
      }
    }
    // Local synced keys the cloud has never seen: push them up.
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && !cloudKeys.has(key) && isSyncedKeyFor(key, userId)) pending.add(key);
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
    meta[key] = new Date().toISOString();
    writeJson(storage, META_KEY, meta);
    pending.add(key);
    savePending();
    if (inFlight) dirtyDuringFlight = true;
    else if (pulled) schedulePush(PUSH_DEBOUNCE_MS);
  };

  return {
    userId,
    start: pullUntilDone,
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
    pull: () => table().select("key,data,updated_at").eq("user_id", userId),
    upsert: (rows) =>
      table().upsert(
        rows.map((row) => ({ user_id: userId, ...row })),
        { onConflict: "user_id,key" },
      ),
    remove: (keys) => table().delete().eq("user_id", userId).in("key", keys),
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void active?.flush();
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

/** Send pending changes (briefly) and detach sync from the signed-out user. */
export function stopCloudSync(): Promise<void> {
  chain = chain.catch(() => undefined).then(stopActive);
  return chain;
}
