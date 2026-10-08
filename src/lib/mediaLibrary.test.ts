import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

const item = (key: string, over: Record<string, string> = {}) => ({ key, name: "Photo", folder: "", alt: "", width: 1080, height: 720, addedAt: "2026-10-08", ...over });

describe("media library", () => {
  it("adds newest first, once, under a device-only key", async () => {
    const { addMedia, loadMedia } = await import("@/lib/mediaLibrary");
    addMedia("u1", item("cimg-aaaaaa1"));
    addMedia("u1", item("cimg-bbbbbb2"));
    addMedia("u1", item("cimg-aaaaaa1", { name: "again" }));
    expect(loadMedia("u1").map((m) => m.key)).toEqual(["cimg-bbbbbb2", "cimg-aaaaaa1"]);
    expect([...store.keys()]).toEqual(["cs-media-u1"]);
  });

  it("edits, removes, and drops entries that aren't picture keys", async () => {
    const { addMedia, updateMedia, removeMedia, loadMedia } = await import("@/lib/mediaLibrary");
    addMedia("u1", item("cimg-aaaaaa1"));
    updateMedia("u1", "cimg-aaaaaa1", { folder: "Office", alt: "Me at my desk" });
    expect(loadMedia("u1")[0]).toMatchObject({ folder: "Office", alt: "Me at my desk" });
    expect(removeMedia("u1", "cimg-aaaaaa1")).toEqual([]);
    store.set("cs-media-u1", JSON.stringify([{ key: "../etc" }, { key: "cimg-cccccc3", name: 5 }, null]));
    expect(loadMedia("u1").map((m) => m.key)).toEqual(["cimg-cccccc3"]);
  });

  it("searches name, folder and alt text, and filters by folder", async () => {
    const { filterMedia, foldersOf } = await import("@/lib/mediaLibrary");
    const list = [item("cimg-a00001", { name: "Headshot", folder: "Me" }), item("cimg-a00002", { name: "Desk", alt: "laptop and CPF chart" }), item("cimg-a00003", { name: "Team", folder: "Events" })];
    expect(filterMedia(list, "cpf", "").map((m) => m.key)).toEqual(["cimg-a00002"]);
    expect(filterMedia(list, "", "Me").map((m) => m.name)).toEqual(["Headshot"]);
    expect(filterMedia(list, "", "-").map((m) => m.name)).toEqual(["Desk"]);
    expect(foldersOf(list)).toEqual(["Events", "Me"]);
  });

  it("keeps a stock photo's credit, only with Pexels links", async () => {
    const { addMedia, loadMedia } = await import("@/lib/mediaLibrary");
    const credit = { by: "Shlok Rana", byUrl: "https://www.pexels.com/@shlok", url: "https://www.pexels.com/photo/x-1/" };
    addMedia("u1", { ...item("cimg-dddddd4"), credit });
    addMedia("u1", { ...item("cimg-eeeeee5"), credit: { by: "X", byUrl: "javascript:alert(1)", url: "https://evil.example/" } });
    addMedia("u1", { ...item("cimg-ffffff6"), credit: { by: "", byUrl: "", url: "" } });
    const [noName, evil, kept] = loadMedia("u1");
    expect(kept.credit).toEqual(credit);
    expect(evil.credit).toEqual({ by: "X", byUrl: "", url: "" });
    expect(noName.credit).toBeUndefined();
  });
});
