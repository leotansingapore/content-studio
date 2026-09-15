import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCloudSync,
  decideSync,
  isSyncedKeyFor,
  type CloudSync,
  type SyncBackend,
  type SyncRow,
  type SyncStorage,
} from "./cloudSync";

const OLD = "2026-07-01T00:00:00.000Z";
const NEW = "2026-07-09T00:00:00.000Z";
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DRAFTS = `content-studio-drafts-${ME}`;

describe("decideSync", () => {
  it("takes the cloud copy when nothing exists locally", () =>
    expect(decideSync(null, null, NEW)).toBe("apply-cloud"));

  it("keeps and pushes local data that was never synced from this device", () =>
    expect(decideSync("local-data", null, NEW)).toBe("push-local"));

  it("applies cloud when the cloud row is newer than the last local write", () =>
    expect(decideSync("local-data", OLD, NEW)).toBe("apply-cloud"));

  it("keeps local when the local write is newer or equal", () => {
    expect(decideSync("local-data", NEW, OLD)).toBe("noop");
    expect(decideSync("local-data", NEW, NEW)).toBe("noop");
  });

  it("pushes an unsent local write unless the cloud changed after it", () => {
    expect(decideSync("local-data", NEW, OLD, true)).toBe("push-local");
    expect(decideSync("local-data", OLD, NEW, true)).toBe("apply-cloud");
    expect(decideSync(null, NEW, OLD, true)).toBe("push-local"); // an unsent delete
  });
});

describe("isSyncedKeyFor", () => {
  it("accepts this user's keys and shared app keys", () => {
    expect(isSyncedKeyFor(DRAFTS, ME)).toBe(true);
    expect(isSyncedKeyFor("content-studio-voice-nudge-dismissed", ME)).toBe(true);
  });

  it("rejects another user's keys and unsynced keys", () => {
    expect(isSyncedKeyFor(`content-studio-drafts-${OTHER}`, ME)).toBe(false);
    expect(isSyncedKeyFor("cs-sync-meta", ME)).toBe(false);
  });
});

class MemoryStorage implements SyncStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

// A fake cs_user_data table; set fail.* to make the next N calls fail.
function fakeBackend(rows: SyncRow[] = []) {
  const table = new Map(rows.map((row) => [row.key, row]));
  const fail = { pull: 0, upsert: 0, remove: 0 };
  const calls = { pull: 0, upsert: [] as SyncRow[][], remove: [] as string[][] };
  const offline = { message: "offline" };
  const backend: SyncBackend = {
    async pull() {
      calls.pull += 1;
      if (fail.pull > 0) {
        fail.pull -= 1;
        return { data: null, error: offline };
      }
      return { data: [...table.values()], error: null };
    },
    async upsert(batch) {
      calls.upsert.push(batch);
      if (fail.upsert > 0) {
        fail.upsert -= 1;
        return { error: offline };
      }
      batch.forEach((row) => table.set(row.key, row));
      return { error: null };
    },
    async remove(keys) {
      calls.remove.push(keys);
      if (fail.remove > 0) {
        fail.remove -= 1;
        return { error: offline };
      }
      keys.forEach((key) => table.delete(key));
      return { error: null };
    },
  };
  return { backend, table, fail, calls };
}

// Write a key the way the app does: to storage, then through the patch.
function write(storage: SyncStorage, sync: CloudSync, key: string, value: string) {
  storage.setItem(key, value);
  sync.noteWrite(key);
}

describe("createCloudSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a save the server rejected", async () => {
    const storage = new MemoryStorage();
    const { backend, table, fail, calls } = fakeBackend();
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();

    fail.upsert = 1;
    write(storage, sync, DRAFTS, "v1");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls.upsert).toHaveLength(1);
    expect(table.has(DRAFTS)).toBe(false);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls.upsert).toHaveLength(2);
    expect(table.get(DRAFTS)?.data).toBe("v1");
  });

  it("stamps a row with when it was written, not when a retry sent it", async () => {
    const storage = new MemoryStorage();
    const { backend, table, fail } = fakeBackend();
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();

    fail.upsert = 1;
    write(storage, sync, DRAFTS, "v1");
    await vi.advanceTimersByTimeAsync(2_800);
    expect(table.get(DRAFTS)?.updated_at).toBe("2026-09-15T10:00:00.000Z");
  });

  it("keeps an unsent save across a reload and sends it next time", async () => {
    const storage = new MemoryStorage();
    const first = createCloudSync(ME, storage, fakeBackend().backend);
    await first.start();
    write(storage, first, DRAFTS, "edit before closing");
    vi.clearAllTimers(); // the tab closes before the debounced save fires

    const cloud = fakeBackend([{ key: DRAFTS, data: "older cloud copy", updated_at: OLD }]);
    const second = createCloudSync(ME, storage, cloud.backend);
    await second.start();
    await vi.advanceTimersByTimeAsync(800);
    expect(cloud.table.get(DRAFTS)?.data).toBe("edit before closing");
    expect(storage.getItem(DRAFTS)).toBe("edit before closing");
  });

  it("takes a newer edit from another device over an older unsent one", async () => {
    const storage = new MemoryStorage();
    const first = createCloudSync(ME, storage, fakeBackend().backend);
    await first.start();
    write(storage, first, DRAFTS, "older edit here");
    vi.clearAllTimers();

    const later = "2026-09-15T11:00:00.000Z";
    const cloud = fakeBackend([{ key: DRAFTS, data: "newer phone edit", updated_at: later }]);
    const second = createCloudSync(ME, storage, cloud.backend);
    await second.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(storage.getItem(DRAFTS)).toBe("newer phone edit");
    expect(cloud.calls.upsert).toHaveLength(0);
  });

  it("pushes nothing while the first pull fails, then syncs once it succeeds", async () => {
    const storage = new MemoryStorage();
    storage.setItem(DRAFTS, "stale laptop copy");
    storage.setItem("cs-sync-meta", JSON.stringify({ [DRAFTS]: OLD }));
    const { backend, table, fail, calls } = fakeBackend([
      { key: DRAFTS, data: "newer phone copy", updated_at: NEW },
    ]);
    fail.pull = 1;
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.pull).toBe(1);
    expect(calls.upsert).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2_000); // the pull retries
    expect(calls.pull).toBe(2);
    expect(storage.getItem(DRAFTS)).toBe("newer phone copy");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.upsert).toHaveLength(0);
    expect(table.get(DRAFTS)?.data).toBe("newer phone copy");
  });

  it("never uploads another user's keys left in this browser", async () => {
    const storage = new MemoryStorage();
    storage.setItem(`content-studio-drafts-${OTHER}`, "someone else's drafts");
    storage.setItem(DRAFTS, "mine");
    const { backend, calls } = fakeBackend();
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();
    sync.noteWrite(`content-studio-drafts-${OTHER}`);
    await vi.advanceTimersByTimeAsync(800);

    const sent = calls.upsert.flat().map((row) => row.key);
    expect(sent).toEqual([DRAFTS]);
  });

  it("deletes the cloud row when a key is removed", async () => {
    const storage = new MemoryStorage();
    const { backend, table, calls } = fakeBackend([{ key: DRAFTS, data: "x", updated_at: OLD }]);
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();
    expect(storage.getItem(DRAFTS)).toBe("x");

    storage.removeItem(DRAFTS);
    sync.noteWrite(DRAFTS);
    await vi.advanceTimersByTimeAsync(800);
    expect(calls.remove).toEqual([[DRAFTS]]);
    expect(table.has(DRAFTS)).toBe(false);
  });

  it("sends pending saves when it stops (sign-out)", async () => {
    const storage = new MemoryStorage();
    const { backend, table } = fakeBackend();
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();
    write(storage, sync, DRAFTS, "last edit");
    await sync.stop();
    expect(table.get(DRAFTS)?.data).toBe("last edit");
    expect(storage.getItem(`cs-sync-pending-${ME}`)).toBeNull();
  });
});
