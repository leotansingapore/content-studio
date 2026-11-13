import { describe, expect, it, vi } from "vitest";
import { brandSyncReady, createBrandSync, keepHeld, type BrandBackend } from "./brandSync";
import { isSyncedKeyFor, type SyncStorage } from "./cloudSync";
import { listMerger } from "./syncMerge";
import { brandKeys, scopeOf, type SharedBrand } from "./sharedBrands";
import { zernioHolds } from "./zernioOutbox";

const OWNER = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ME = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BRAND: SharedBrand = { brand: "11111111-2222-4333-8444-555555555555", owner: OWNER, profile: "pabc1", name: "Acme", role: "member" };
const SCOPE = scopeOf(OWNER, "pabc1");
const POSTS = `content-studio-drafts-${SCOPE}`;
const PLAN = `content-studio-plan-${SCOPE}`;
const KIT = `content-studio-carousel-brand-${SCOPE}`;
const drafts = listMerger<{ id: string }>();
const mergerFor = (key: string) => (key.startsWith("content-studio-drafts-") ? drafts : undefined);

function memory(): SyncStorage & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

/** 037's cs_brand_rows / cs_brand_swap / cs_brand_drop over one owner's rows, stamps from a server clock. */
function server(rows: Record<string, string> = {}) {
  let clock = Date.parse("2026-11-14T00:00:00Z");
  const stamp = () => new Date((clock += 1000)).toISOString().replace("Z", "123+00:00");
  const db = new Map<string, { data: string; updated_at: string }>(Object.entries(rows).map(([k, v]) => [k, { data: v, updated_at: stamp() }]));
  const writable = new Set(brandKeys(SCOPE, true));
  const readable = new Set(brandKeys(SCOPE, false));
  const calls: string[] = [];
  const state = { gone: false, offline: false };
  const held = (data: string) => (JSON.parse(data) as { id: string; zernio?: { postId?: string; status?: string } }[]).filter((d) => zernioHolds(d as unknown as Parameters<typeof zernioHolds>[0]));
  const backend: BrandBackend = {
    async rows(keys) {
      calls.push(`rows${keys ? ` ${keys.length}` : ""}`);
      if (state.offline) return { data: null, error: { message: "Failed to fetch" } };
      if (state.gone) return { data: null, error: { message: "not_on_brand" } };
      return { data: [...db].filter(([k]) => readable.has(k) && (!keys || keys.includes(k))).map(([key, r]) => ({ key, ...r })), error: null };
    },
    async swap(key, data, _stamp, seen) {
      calls.push(`swap ${key.split("-")[2]}`);
      if (state.offline) return { data: null, error: { message: "Failed to fetch" } };
      if (state.gone) return { data: null, error: { message: "not_on_brand" } };
      if (!writable.has(key)) return { data: null, error: { message: "key_not_shared" } };
      const old = db.get(key);
      if ((old?.updated_at ?? null) !== seen) return { data: null, error: null };
      if (key === POSTS && old) {
        const after = JSON.parse(data) as unknown[];
        if (held(old.data).some((h) => !after.some((a) => JSON.stringify(a) === JSON.stringify(h)))) return { data: null, error: { message: "held_post" } };
      }
      const at = stamp();
      db.set(key, { data, updated_at: at });
      return { data: at, error: null };
    },
    async drop(key, seen) {
      calls.push(`drop ${key.split("-")[2]}`);
      const old = db.get(key);
      if (!old) return { data: true, error: null };
      if (old.updated_at !== seen) return { data: false, error: null };
      db.delete(key);
      return { data: true, error: null };
    },
  };
  // another editor saving straight to the server
  const edit = (key: string, data: string) => db.set(key, { data, updated_at: stamp() });
  return { backend, db, calls, state, edit };
}

const engine = (s: SyncStorage, srv: ReturnType<typeof server>, extra: Partial<Parameters<typeof createBrandSync>[0]> = {}) =>
  createBrandSync({ userId: ME, brand: BRAND, storage: s, backend: srv.backend, mergerFor, ...extra });

describe("a member's first pull", () => {
  it("takes the brand's cloud copies, and nothing else on the device changes", async () => {
    const s = memory();
    s.setItem("content-studio-plan-" + ME, "my own plan");
    const srv = server({ [PLAN]: '{"week":"v1"}', [KIT]: '{"name":"Acme"}' });
    const e = engine(s, srv);
    expect(brandSyncReady(ME, BRAND.brand, s)).toBe(false);
    await e.start();
    expect(s.getItem(PLAN)).toBe('{"week":"v1"}');
    expect(s.getItem(KIT)).toBe('{"name":"Acme"}');
    expect(s.getItem("content-studio-plan-" + ME)).toBe("my own plan");
    expect(brandSyncReady(ME, BRAND.brand, s)).toBe(true);
    expect(brandSyncReady("someone-else", BRAND.brand, s)).toBe(false);
  });

  it("never lets a write made before it overwrite the owner's copy (review finding 1)", async () => {
    const s = memory();
    const srv = server({ [PLAN]: '{"week":"owner"}' });
    const lost = vi.fn();
    const e = engine(s, srv, { onLost: lost });
    s.setItem(PLAN, '{"week":"typed on an empty copy"}');
    e.noteWrite(PLAN);
    await e.start();
    await e.flush();
    expect(srv.db.get(PLAN)!.data).toBe('{"week":"owner"}');
    expect(s.getItem(PLAN)).toBe('{"week":"owner"}');
    expect(lost).toHaveBeenCalledWith(PLAN, "conflict");
  });

  it("adds a key the cloud doesn't have yet", async () => {
    const s = memory();
    const srv = server();
    const e = engine(s, srv);
    await e.start();
    s.setItem(PLAN, '{"week":"new"}');
    e.noteWrite(PLAN);
    await e.flush();
    expect(srv.db.get(PLAN)!.data).toBe('{"week":"new"}');
  });
});

describe("saving", () => {
  it("lands on the stamp it last saw, and keeps going from the stamp the server wrote", async () => {
    const s = memory();
    const srv = server({ [PLAN]: '{"week":"v1"}' });
    const e = engine(s, srv);
    await e.start();
    for (const v of ['{"week":"v2"}', '{"week":"v3"}']) {
      s.setItem(PLAN, v);
      e.noteWrite(PLAN);
      await e.flush();
      expect(srv.db.get(PLAN)!.data).toBe(v);
    }
  });

  it("never reverts a newer copy: a save on an old one is refused, the newer copy is taken, and the person is told (finding 5)", async () => {
    const s = memory();
    const srv = server({ [PLAN]: '{"week":"v1"}' });
    const lost = vi.fn();
    const e = engine(s, srv, { onLost: lost });
    await e.start();
    srv.edit(PLAN, '{"week":"owner saved first"}');
    s.setItem(PLAN, '{"week":"member, on v1"}');
    e.noteWrite(PLAN);
    await e.flush();
    expect(srv.db.get(PLAN)!.data).toBe('{"week":"owner saved first"}');
    expect(s.getItem(PLAN)).toBe('{"week":"owner saved first"}');
    expect(lost).toHaveBeenCalledWith(PLAN, "conflict");
  });

  it("merges posts one by one, keeping both editors' new posts", async () => {
    const s = memory();
    const srv = server({ [POSTS]: JSON.stringify([{ id: "a" }]) });
    const e = engine(s, srv);
    await e.start();
    srv.edit(POSTS, JSON.stringify([{ id: "b" }, { id: "a" }]));
    s.setItem(POSTS, JSON.stringify([{ id: "c" }, { id: "a" }]));
    e.noteWrite(POSTS);
    await e.flush();
    const ids = (JSON.parse(srv.db.get(POSTS)!.data) as { id: string }[]).map((d) => d.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
    expect(JSON.parse(s.getItem(POSTS)!).map((d: { id: string }) => d.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("puts back a post Zernio holds before saving, so the server never refuses an honest device (finding 4)", async () => {
    const heldPost = { id: "h", draft: "goes out", zernio: { postId: "z1", status: "scheduled" } };
    const s = memory();
    const srv = server({ [POSTS]: JSON.stringify([{ id: "a" }, heldPost]) });
    const e = engine(s, srv);
    await e.start();
    // the member deletes the held post and re-words another
    s.setItem(POSTS, JSON.stringify([{ id: "a", draft: "edited" }]));
    e.noteWrite(POSTS);
    await e.flush();
    const saved = JSON.parse(srv.db.get(POSTS)!.data);
    expect(saved).toContainEqual(heldPost);
    expect(saved).toContainEqual({ id: "a", draft: "edited" });
    expect(srv.calls.filter((c) => c.startsWith("swap"))).toHaveLength(1);
  });

  it("removes a key on the stamp it saw, and brings it back if someone saved it since", async () => {
    const s = memory();
    const srv = server({ [PLAN]: '{"week":"v1"}' });
    const e = engine(s, srv);
    await e.start();
    s.removeItem(PLAN);
    e.noteWrite(PLAN);
    await e.flush();
    expect(srv.db.has(PLAN)).toBe(false);

    srv.edit(PLAN, '{"week":"again"}');
    await e.refresh(true);
    srv.edit(PLAN, '{"week":"owner, after"}');
    s.removeItem(PLAN);
    e.noteWrite(PLAN);
    await e.flush();
    expect(srv.db.get(PLAN)!.data).toBe('{"week":"owner, after"}');
    expect(s.getItem(PLAN)).toBe('{"week":"owner, after"}');
  });

  it("never sends a read-only key, and a local change to one gives way to the cloud at the next pull", async () => {
    const s = memory();
    const srv = server({ [KIT]: '{"name":"Acme"}' });
    const e = engine(s, srv);
    await e.start();
    s.setItem(KIT, '{"name":"Hijacked"}');
    e.noteWrite(KIT);
    await e.flush();
    expect(srv.calls.some((c) => c.startsWith("swap"))).toBe(false);
    await e.refresh(true);
    expect(s.getItem(KIT)).toBe('{"name":"Acme"}');
  });

  it("keeps an unsent save through an offline spell and sends it once back", async () => {
    vi.useFakeTimers();
    try {
      const s = memory();
      const srv = server({ [PLAN]: '{"week":"v1"}' });
      const e = engine(s, srv);
      await e.start();
      srv.state.offline = true;
      s.setItem(PLAN, '{"week":"offline edit"}');
      e.noteWrite(PLAN);
      await e.flush();
      expect(srv.db.get(PLAN)!.data).toBe('{"week":"v1"}');
      srv.state.offline = false;
      await vi.advanceTimersByTimeAsync(3_000);
      expect(srv.db.get(PLAN)!.data).toBe('{"week":"offline edit"}');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pulling again", () => {
  it("drops a key removed elsewhere, but keeps one another tab just made (finding 7)", async () => {
    const s = memory();
    const srv = server({ [PLAN]: '{"week":"v1"}' });
    const e = engine(s, srv);
    await e.start();
    srv.db.delete(PLAN);
    // another tab of this device writes a new key and records it as pending, then this tab pulls
    const NOTES = `content-studio-calnotes-${SCOPE}`;
    const other = engine(s, srv);
    s.setItem(NOTES, "[]");
    other.noteWrite(NOTES);
    await e.refresh(true);
    expect(s.getItem(PLAN)).toBeNull();
    expect(s.getItem(NOTES)).toBe("[]");
  });

  it("stops for good when the server says this account is off the brand", async () => {
    const s = memory();
    const srv = server({ [PLAN]: '{"week":"v1"}' });
    const gone = vi.fn();
    const e = engine(s, srv, { onGone: gone });
    await e.start();
    srv.state.gone = true;
    s.setItem(PLAN, '{"week":"after removal"}');
    e.noteWrite(PLAN);
    await e.flush();
    expect(gone).toHaveBeenCalledTimes(1);
  });
});

describe("tearing down", () => {
  it("removes the brand's copies, merge bases and its own state, and nothing else (finding 6)", async () => {
    const s = memory();
    const srv = server({ [PLAN]: '{"week":"v1"}', [POSTS]: "[]" });
    const e = engine(s, srv);
    await e.start();
    s.setItem("content-studio-plan-" + ME, "mine");
    e.teardown();
    expect([...s.m.keys()]).toEqual(["content-studio-plan-" + ME]);
    expect(brandSyncReady(ME, BRAND.brand, s)).toBe(false);
  });
});

describe("who owns which key", () => {
  it("gives every brand key to its brand sync alone, never to the member's main sync", () => {
    const s = memory();
    const srv = server();
    const a = engine(s, srv);
    const b = createBrandSync({ userId: ME, brand: { ...BRAND, brand: "22222222-2222-4333-8444-555555555555", profile: "me" }, storage: s, backend: srv.backend, mergerFor });
    for (const key of brandKeys(SCOPE, false)) {
      expect(a.owns(key)).toBe(true);
      expect(b.owns(key)).toBe(false);
      expect(isSyncedKeyFor(key, ME)).toBe(false);
    }
    for (const key of brandKeys(OWNER, false)) expect(a.owns(key)).toBe(false);
    for (const key of brandKeys(ME, false)) expect(a.owns(key) || b.owns(key)).toBe(false);
  });
});

describe("keepHeld", () => {
  it("puts back, unchanged, every post Zernio holds, and leaves the rest of the list alone", () => {
    const h = { id: "h", zernio: { postId: "z", status: "scheduled" } };
    const done = { id: "p", zernio: { postId: "y", status: "published" } };
    expect(JSON.parse(keepHeld(JSON.stringify([{ id: "a" }]), JSON.stringify([{ id: "a" }, h, done])))).toEqual([{ id: "a" }, h]);
    expect(JSON.parse(keepHeld(JSON.stringify([{ id: "h", draft: "x" }]), JSON.stringify([h])))).toEqual([h]);
    expect(keepHeld("not json", "[]")).toBe("not json");
  });
});
