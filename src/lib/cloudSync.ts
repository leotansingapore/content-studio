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
//
// Callers never change: draftHistory, contentPlan, coach, savedItems, etc.
// keep reading/writing localStorage as before.

import { supabase } from "@/lib/supabase";

const SYNC_PREFIX = "content-studio-";
const META_KEY = "cs-sync-meta"; // deliberately outside SYNC_PREFIX
const PUSH_DEBOUNCE_MS = 800;

type Meta = Record<string, string>; // key -> ISO timestamp of last local write

export type SyncDecision = "apply-cloud" | "push-local" | "noop";

// Pure decision logic (unit-tested). localValue/metaTs describe this device,
// cloudTs the server row. Rules:
//   - nothing local: take the cloud copy
//   - local data but never synced here: keep local, push it up
//   - both synced before: newest timestamp wins
export function decideSync(
  localValue: string | null,
  metaTs: string | null,
  cloudTs: string,
): SyncDecision {
  if (localValue === null) return "apply-cloud";
  if (!metaTs) return "push-local";
  return new Date(cloudTs).getTime() > new Date(metaTs).getTime()
    ? "apply-cloud"
    : "noop";
}

function loadMeta(): Meta {
  try {
    return JSON.parse(window.localStorage.getItem(META_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveMeta(meta: Meta) {
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage full or unavailable; sync degrades to session-only
  }
}

let initialized = false;

export async function initCloudSync(userId: string): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const storage = window.localStorage;
  const rawSet = storage.setItem.bind(storage);
  const rawRemove = storage.removeItem.bind(storage);
  const meta = loadMeta();

  const pending = new Map<string, string | null>(); // key -> value (null = delete)
  let timer: number | undefined;

  const flush = async () => {
    const batch = [...pending.entries()];
    pending.clear();
    const upserts = batch
      .filter(([, v]) => v !== null)
      .map(([key, data]) => ({
        user_id: userId,
        key,
        data: data as string,
        updated_at: new Date().toISOString(),
      }));
    const deletes = batch.filter(([, v]) => v === null).map(([key]) => key);
    try {
      if (upserts.length) {
        await supabase.from("cs_user_data").upsert(upserts, { onConflict: "user_id,key" });
      }
      if (deletes.length) {
        await supabase.from("cs_user_data").delete().eq("user_id", userId).in("key", deletes);
      }
    } catch {
      // offline or transient failure: re-queue so the next write retries
      batch.forEach(([k, v]) => {
        if (!pending.has(k)) pending.set(k, v);
      });
    }
  };

  const queue = (key: string, value: string | null) => {
    pending.set(key, value);
    meta[key] = new Date().toISOString();
    saveMeta(meta);
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, PUSH_DEBOUNCE_MS);
  };

  // 1. Pull: apply cloud rows that are newer than this device's writes.
  try {
    const { data: rows } = await supabase
      .from("cs_user_data")
      .select("key,data,updated_at");
    const cloudKeys = new Set<string>();
    for (const row of rows ?? []) {
      cloudKeys.add(row.key);
      const decision = decideSync(storage.getItem(row.key), meta[row.key] ?? null, row.updated_at);
      if (decision === "apply-cloud") {
        rawSet(row.key, row.data);
        meta[row.key] = row.updated_at;
      } else if (decision === "push-local") {
        queue(row.key, storage.getItem(row.key));
      }
    }
    // Local synced-prefix keys the cloud has never seen: push them up.
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(SYNC_PREFIX) && !cloudKeys.has(key)) {
        queue(key, storage.getItem(key));
      }
    }
    saveMeta(meta);
  } catch {
    // pull failed (offline): app still works from local; push retries later
  }

  // 2. Patch: mirror future writes to the cloud.
  storage.setItem = (key: string, value: string) => {
    rawSet(key, value);
    if (key.startsWith(SYNC_PREFIX)) queue(key, value);
  };
  storage.removeItem = (key: string) => {
    rawRemove(key);
    if (key.startsWith(SYNC_PREFIX)) queue(key, null);
  };

  // Best-effort flush when the tab hides or closes.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pending.size) void flush();
  });
}
