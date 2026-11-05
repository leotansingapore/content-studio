import { listMerger } from "./syncMerge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCloudSync,
  decideSync,
  isSyncedKeyFor,
  registerSyncMerge,
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
  const fail = { pull: 0, upsert: 0, remove: 0, swap: 0 };
  const calls = { pull: 0, pullKeys: [] as (string[] | undefined)[], upsert: [] as SyncRow[][], remove: [] as string[][], swap: 0 };
  const offline = { message: "offline" };
  const backend: SyncBackend = {
    async pull(keys) {
      calls.pull += 1;
      calls.pullKeys.push(keys);
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
    async pullLike(prefixes) {
      calls.pull += 1;
      return { data: [...table.values()].filter((row) => prefixes.some((p) => row.key.startsWith(p))), error: null };
    },
    async swap(row, seen) {
      calls.swap += 1;
      if (fail.swap > 0) {
        fail.swap -= 1;
        return "conflict";
      }
      if ((table.get(row.key)?.updated_at ?? null) !== seen) return "conflict";
      table.set(row.key, row);
      return "ok";
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

// Holds the first upsert until release() is called: a save still on its way.
function holdFirstSave(backend: SyncBackend): () => void {
  const upsert = backend.upsert;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  backend.upsert = async (rows) => {
    if (first) {
      first = false;
      await held;
    }
    return upsert(rows);
  };
  return release;
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

  it("sends an edit made while an earlier save was still on its way", async () => {
    const storage = new MemoryStorage();
    const { backend, table } = fakeBackend();
    const release = holdFirstSave(backend);
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();

    write(storage, sync, DRAFTS, "v1");
    await vi.advanceTimersByTimeAsync(800); // v1 is on its way
    write(storage, sync, DRAFTS, "v2");
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(table.get(DRAFTS)?.data).toBe("v1");
    await vi.advanceTimersByTimeAsync(800);
    expect(table.get(DRAFTS)?.data).toBe("v2");
  });

  it("signing out mid-save still sends the edit made during it", async () => {
    const storage = new MemoryStorage();
    const { backend, table } = fakeBackend();
    const release = holdFirstSave(backend);
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();

    write(storage, sync, DRAFTS, "v1");
    await vi.advanceTimersByTimeAsync(800);
    write(storage, sync, DRAFTS, "last edit");
    const signingOut = sync.stop();
    release();
    await signingOut;
    expect(table.get(DRAFTS)?.data).toBe("last edit");
    expect(storage.getItem(`cs-sync-pending-${ME}`)).toBeNull();
  });

  it("keeps a removal the server rejected, so the post doesn't come back after a reload", async () => {
    const storage = new MemoryStorage();
    const cloud = fakeBackend([{ key: DRAFTS, data: "x", updated_at: OLD }]);
    const first = createCloudSync(ME, storage, cloud.backend);
    await first.start();
    cloud.fail.remove = 1;
    storage.removeItem(DRAFTS);
    first.noteWrite(DRAFTS);
    await vi.advanceTimersByTimeAsync(800);
    expect(cloud.calls.remove).toHaveLength(1);
    expect(cloud.table.has(DRAFTS)).toBe(true);
    vi.clearAllTimers(); // the tab closes before the retry

    const second = createCloudSync(ME, storage, cloud.backend);
    await second.start();
    await vi.advanceTimersByTimeAsync(800);
    expect(storage.getItem(DRAFTS)).toBeNull();
    expect(cloud.table.has(DRAFTS)).toBe(false);
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

  it("refresh takes a job's newer row for the named keys only", async () => {
    const TEAM = `content-studio-teamposts-${ME}`;
    const storage = new MemoryStorage();
    const { backend, table, calls } = fakeBackend([
      { key: TEAM, data: "rev 1", updated_at: OLD },
      { key: DRAFTS, data: "drafts v1", updated_at: OLD },
    ]);
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();

    table.set(TEAM, { key: TEAM, data: "rev 2", updated_at: NEW });
    table.set(DRAFTS, { key: DRAFTS, data: "drafts v2", updated_at: NEW });
    await sync.refresh([TEAM]);
    expect(calls.pullKeys.at(-1)).toEqual([TEAM]);
    expect(storage.getItem(TEAM)).toBe("rev 2");
    expect(storage.getItem(DRAFTS)).toBe("drafts v1"); // the fake returned it too; left for the next full pull
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.upsert).toHaveLength(0);
  });

  it("refresh keeps an unsent local write over an older cloud row", async () => {
    const REVIEWS = `content-studio-teamreviews-${ME}`;
    const storage = new MemoryStorage();
    const { backend, table } = fakeBackend([{ key: REVIEWS, data: "{}", updated_at: OLD }]);
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();
    write(storage, sync, REVIEWS, '{"tp1":{"approvedRev":1,"comments":[]}}');
    await sync.refresh([REVIEWS]);
    expect(storage.getItem(REVIEWS)).toContain("approvedRev");
    await vi.advanceTimersByTimeAsync(800);
    expect(table.get(REVIEWS)?.data).toContain("approvedRev");
  });

  it("knows the stamp of the row it sent and of the row it took, so an open slideshow re-reads only another writer's change", async () => {
    const DESIGNS = `content-studio-designs-${ME}`;
    const storage = new MemoryStorage();
    const { backend, table } = fakeBackend();
    const sync = createCloudSync(ME, storage, backend);
    await sync.start();
    expect(sync.syncedAt(DESIGNS)).toBeNull();

    write(storage, sync, DESIGNS, "my deck");
    await vi.advanceTimersByTimeAsync(800);
    // this device's own save: the cloud row carries the stamp it knows, so it is nothing new
    expect(sync.syncedAt(DESIGNS)).toBe(table.get(DESIGNS)?.updated_at);

    // Claude rewrites the row later: a different stamp, until the refresh takes it
    table.set(DESIGNS, { key: DESIGNS, data: "Claude's deck", updated_at: "2026-09-15T10:05:00.000Z" });
    expect(sync.syncedAt(DESIGNS)).not.toBe(table.get(DESIGNS)?.updated_at);
    await sync.refresh([DESIGNS]);
    expect(storage.getItem(DESIGNS)).toBe("Claude's deck");
    expect(sync.syncedAt(DESIGNS)).toBe("2026-09-15T10:05:00.000Z");
  });

  it("refresh waits for the first pull and stops with the engine", async () => {
    const storage = new MemoryStorage();
    const { backend, calls } = fakeBackend();
    const sync = createCloudSync(ME, storage, backend);
    await sync.refresh([DRAFTS]);
    expect(calls.pull).toBe(0);
    await sync.start();
    await sync.stop();
    await sync.refresh([DRAFTS]);
    expect(calls.pull).toBe(1);
  });
});

describe("posts lists merged post by post", () => {
  const LIST = `content-studio-mtest-${ME}`;
  const ids = (v: string | null | undefined) => (v ? (JSON.parse(v) as { id: string }[]).map((x) => x.id) : []);
  const list = (...posts: string[]) => JSON.stringify(posts.map((id) => ({ id, text: id })));
  const changed: string[] = [];
  registerSyncMerge("content-studio-mtest-", listMerger({ changed: (key) => void changed.push(key) }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
    changed.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  async function twoDevices() {
    const cloud = fakeBackend();
    const laptop = new MemoryStorage();
    const phone = new MemoryStorage();
    const a = createCloudSync(ME, laptop, cloud.backend);
    const b = createCloudSync(ME, phone, cloud.backend);
    await a.start();
    await b.start();
    return { cloud, laptop, phone, a, b };
  }

  it("keeps the post each open device added, on both devices, instead of the last save wiping the other's", async () => {
    const { cloud, laptop, phone, a, b } = await twoDevices();
    write(laptop, a, LIST, list("laptop-post"));
    await vi.advanceTimersByTimeAsync(1_000);
    write(phone, b, LIST, list("phone-post"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ids(cloud.table.get(LIST)?.data).sort()).toEqual(["laptop-post", "phone-post"]);
    // the laptop's tab comes back and reads what the phone saved, with no reload
    await vi.advanceTimersByTimeAsync(10_000);
    await a.refreshMerged();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ids(laptop.getItem(LIST)).sort()).toEqual(["laptop-post", "phone-post"]);
    expect(changed).toContain(LIST);
    expect(ids(phone.getItem(LIST)).sort()).toEqual(["laptop-post", "phone-post"]);
  });

  it("drops a post deleted on one device from the other, instead of the stale copy bringing it back", async () => {
    const { cloud, laptop, phone, a, b } = await twoDevices();
    write(laptop, a, LIST, list("keep", "gone"));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await b.refreshMerged();
    expect(ids(phone.getItem(LIST))).toEqual(["keep", "gone"]);
    // the phone deletes one; the laptop, still holding it, saves something else
    write(phone, b, LIST, list("keep"));
    await vi.advanceTimersByTimeAsync(1_000);
    write(laptop, a, LIST, list("new", "keep", "gone"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ids(cloud.table.get(LIST)?.data).sort()).toEqual(["keep", "new"]);
    expect(ids(laptop.getItem(LIST)).sort()).toEqual(["keep", "new"]);
  });

  it("reads and merges again when another device saved between its read and its write", async () => {
    const { cloud, laptop, a } = await twoDevices();
    write(laptop, a, LIST, list("first"));
    await vi.advanceTimersByTimeAsync(1_000);
    // another device's save lands just before this one's write
    const pull = cloud.backend.pull.bind(cloud.backend);
    let raced = false;
    cloud.backend.pull = async (keys) => {
      const res = await pull(keys);
      if (!raced && keys?.includes(LIST)) {
        raced = true;
        cloud.table.set(LIST, { key: LIST, data: list("other", "first"), updated_at: "2026-11-06T10:00:01.500Z" });
      }
      return res;
    };
    write(laptop, a, LIST, list("second", "first"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ids(cloud.table.get(LIST)?.data).sort()).toEqual(["first", "other", "second"]);
    expect(cloud.calls.swap).toBeGreaterThanOrEqual(3);
  });

  it("on the first open after this release, a device synced before takes its copy as the base: a post deleted elsewhere stays deleted", async () => {
    const laptop = new MemoryStorage();
    laptop.setItem(LIST, list("a", "b", "c"));
    laptop.setItem("cs-sync-meta", JSON.stringify({ [LIST]: "2026-11-01T00:00:00.000Z" }));
    // the phone deleted c on 3 Nov; nothing is unsent on the laptop
    const cloud = fakeBackend([{ key: LIST, data: list("a", "b"), updated_at: "2026-11-03T00:00:00.000Z" }]);
    await createCloudSync(ME, laptop, cloud.backend).start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ids(cloud.table.get(LIST)?.data)).toEqual(["a", "b"]);
    expect(ids(laptop.getItem(LIST))).toEqual(["a", "b"]);
  });

  it("on that first open, a full list keeps its newest posts: no stale ones land on top and push real ones off the cap", async () => {
    const CAP = `content-studio-mcap-${ME}`;
    registerSyncMerge("content-studio-mcap-", listMerger({ after: (l) => l.slice(0, 150) }));
    const old = Array.from({ length: 150 }, (_, i) => `o${i + 1}`);
    const fresh = Array.from({ length: 10 }, (_, i) => `n${i + 1}`);
    const laptop = new MemoryStorage();
    laptop.setItem(CAP, list(...old));
    laptop.setItem("cs-sync-meta", JSON.stringify({ [CAP]: "2026-11-01T00:00:00.000Z" }));
    const cloud = fakeBackend([{ key: CAP, data: list(...fresh, ...old.slice(0, 140)), updated_at: "2026-11-03T00:00:00.000Z" }]);
    await createCloudSync(ME, laptop, cloud.backend).start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ids(cloud.table.get(CAP)?.data)).toEqual([...fresh, ...old.slice(0, 140)]);
  });

  it("a save that lost its race keeps the cloud copy it merged as the base, so a post deleted by the other device stays deleted", async () => {
    const laptop = new MemoryStorage();
    laptop.setItem(LIST, list("a"));
    const cloud = fakeBackend([{ key: LIST, data: list("a"), updated_at: "2026-11-06T09:00:00.000Z" }]);
    const swap = cloud.backend.swap!.bind(cloud.backend);
    let n = 0;
    cloud.backend.swap = async (row, seen) => {
      // the phone deletes y just before the laptop's first write lands
      if (n++ === 0) cloud.table.set(LIST, { key: LIST, data: list("a"), updated_at: "2026-11-06T10:00:00.900Z" });
      return swap(row, seen);
    };
    const sync = createCloudSync(ME, laptop, cloud.backend);
    await sync.start();
    // the phone adds y, then the laptop adds x
    cloud.table.set(LIST, { key: LIST, data: list("y", "a"), updated_at: "2026-11-06T09:30:00.000Z" });
    write(laptop, sync, LIST, list("x", "a"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ids(cloud.table.get(LIST)?.data).sort()).toEqual(["a", "x"]);
  });

  it("leaves a value that isn't a list of posts to the old whole-value rules", async () => {
    const { cloud, laptop, a } = await twoDevices();
    write(laptop, a, LIST, "not a list");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cloud.table.get(LIST)?.data).toBe("not a list");
  });
});

describe("removed data stays removed on every device", () => {
  const PLAN = `content-studio-plan-${ME}`;
  const remove = (storage: SyncStorage, sync: CloudSync, key: string) => {
    storage.removeItem(key);
    sync.noteWrite(key);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  async function bothHoldPlan() {
    const cloud = fakeBackend();
    const laptop = new MemoryStorage();
    const phone = new MemoryStorage();
    const a = createCloudSync(ME, laptop, cloud.backend);
    await a.start();
    write(laptop, a, PLAN, "this week's plan");
    await vi.advanceTimersByTimeAsync(1_000);
    const b = createCloudSync(ME, phone, cloud.backend);
    await b.start();
    expect(phone.getItem(PLAN)).toBe("this week's plan");
    return { cloud, laptop, phone, a, b };
  }

  it("a plan deleted on the laptop is removed from the open phone, and the phone never uploads it again", async () => {
    const { cloud, phone, laptop, a, b } = await bothHoldPlan();
    remove(laptop, a, PLAN);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cloud.table.has(PLAN)).toBe(false);
    // the phone's tab comes back
    await vi.advanceTimersByTimeAsync(10_000);
    await b.refreshMerged();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(phone.getItem(PLAN)).toBeNull();
    // and a reload of a device that still held it (before this change it pushed it back up)
    const stale = new MemoryStorage();
    stale.setItem(PLAN, "this week's plan");
    stale.setItem("cs-sync-meta", JSON.stringify({ [PLAN]: "2026-11-06T10:00:00.500Z" }));
    await createCloudSync(ME, stale, cloud.backend).start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(stale.getItem(PLAN)).toBeNull();
    expect(cloud.table.has(PLAN)).toBe(false);
  });

  it("undoes an old build uploading a deleted plan again with its old stamp", async () => {
    const { cloud, phone, laptop, a } = await bothHoldPlan();
    remove(laptop, a, PLAN);
    await vi.advanceTimersByTimeAsync(1_000);
    cloud.table.set(PLAN, { key: PLAN, data: "this week's plan", updated_at: "2026-11-06T10:00:00.500Z" });
    await createCloudSync(ME, phone, cloud.backend).start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(phone.getItem(PLAN)).toBeNull();
    expect(cloud.table.has(PLAN)).toBe(false);
  });

  it("keeps a plan made again after the delete, on every device", async () => {
    const { cloud, laptop, a } = await bothHoldPlan();
    remove(laptop, a, PLAN);
    await vi.advanceTimersByTimeAsync(5_000);
    write(laptop, a, PLAN, "next week's plan");
    await vi.advanceTimersByTimeAsync(1_000);
    const fresh = new MemoryStorage();
    await createCloudSync(ME, fresh, cloud.backend).start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fresh.getItem(PLAN)).toBe("next week's plan");
    expect(cloud.table.get(PLAN)?.data).toBe("next week's plan");
  });

  it("keeps a key removed and written again in the same moment (a reset), here and on other devices", async () => {
    const { cloud, laptop, a } = await bothHoldPlan();
    remove(laptop, a, PLAN);
    write(laptop, a, PLAN, "reset plan");
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await a.refreshMerged();
    expect(laptop.getItem(PLAN)).toBe("reset plan");
    const fresh = new MemoryStorage();
    await createCloudSync(ME, fresh, cloud.backend).start();
    expect(fresh.getItem(PLAN)).toBe("reset plan");
  });

  it("merges the brand list: a brand added on each device survives, and one removed on either goes from both", async () => {
    const LIST = `content-studio-profiles-${ME}`;
    const brands = (...ids: string[]) => JSON.stringify(ids.map((id) => ({ id, name: id, createdAt: "" })));
    const names = (v: string | null | undefined) => (v ? (JSON.parse(v) as { id: string }[]).map((x) => x.id).sort() : []);
    const cloud = fakeBackend();
    const laptop = new MemoryStorage();
    const phone = new MemoryStorage();
    const a = createCloudSync(ME, laptop, cloud.backend);
    const b = createCloudSync(ME, phone, cloud.backend);
    await a.start();
    await b.start();
    write(laptop, a, LIST, brands("me", "radiant"));
    await vi.advanceTimersByTimeAsync(1_000);
    write(phone, b, LIST, brands("me", "coach"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(names(cloud.table.get(LIST)?.data)).toEqual(["coach", "me", "radiant"]);
    await vi.advanceTimersByTimeAsync(10_000);
    await a.refreshMerged();
    write(laptop, a, LIST, brands("me", "radiant"));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await b.refreshMerged();
    expect(names(phone.getItem(LIST))).toEqual(["me", "radiant"]);
  });
});

