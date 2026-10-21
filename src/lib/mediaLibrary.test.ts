import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addMedia, filterMedia, foldersOf, loadMedia, removeMedia, updateMedia } from "@/lib/mediaLibrary";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

const item = (key: string, over: Record<string, string> = {}) => ({ key, name: "Photo", folder: "", alt: "", width: 1080, height: 720, addedAt: "2026-10-08", ...over });

describe("media library", () => {
  it("adds newest first, once, under a device-only key", async () => {
    addMedia("u1", item("cimg-aaaaaa1"));
    addMedia("u1", item("cimg-bbbbbb2"));
    addMedia("u1", item("cimg-aaaaaa1", { name: "again" }));
    expect(loadMedia("u1").map((m) => m.key)).toEqual(["cimg-bbbbbb2", "cimg-aaaaaa1"]);
    expect([...store.keys()]).toEqual(["cs-media-u1"]);
  });

  it("edits, removes, and drops entries that aren't picture keys", async () => {
    addMedia("u1", item("cimg-aaaaaa1"));
    updateMedia("u1", "cimg-aaaaaa1", { folder: "Office", alt: "Me at my desk" });
    expect(loadMedia("u1")[0]).toMatchObject({ folder: "Office", alt: "Me at my desk" });
    expect(removeMedia("u1", "cimg-aaaaaa1")).toEqual([]);
    store.set("cs-media-u1", JSON.stringify([{ key: "../etc" }, { key: "cimg-cccccc3", name: 5 }, null]));
    expect(loadMedia("u1").map((m) => m.key)).toEqual(["cimg-cccccc3"]);
  });

  it("searches name, folder and alt text, and filters by folder", async () => {
    const list = [item("cimg-a00001", { name: "Headshot", folder: "Me" }), item("cimg-a00002", { name: "Desk", alt: "laptop and CPF chart" }), item("cimg-a00003", { name: "Team", folder: "Events" })];
    expect(filterMedia(list, "cpf", "").map((m) => m.key)).toEqual(["cimg-a00002"]);
    expect(filterMedia(list, "", "Me").map((m) => m.name)).toEqual(["Headshot"]);
    expect(filterMedia(list, "", "-").map((m) => m.name)).toEqual(["Desk"]);
    expect(foldersOf(list)).toEqual(["Events", "Me"]);
  });

  // Pinned on today's code (main e0e6cf48) before brand-media-library: what every other account and caller reads.
  it("pinned: loadMedia on today's index", () => {
    store.set("cs-media-u1", JSON.stringify([
      { key: "cimg-aaaaaa1", name: "N".repeat(90), folder: "F".repeat(50), alt: "A".repeat(260), width: "1080", height: 720, addedAt: "2026-10-01", credit: { by: "Shlok", byUrl: "https://www.pexels.com/@shlok", url: "https://evil.example/" } },
      { key: "cimg-bbbbbb2", name: 7, width: null, extra: "dropped" },
      { key: "cvid-cccccc3", name: "A video key today" },
      { key: "CIMG-dddddd4" },
      "junk",
    ]));
    expect(loadMedia("u1")).toEqual([
      { key: "cimg-aaaaaa1", name: "N".repeat(80), folder: "F".repeat(40), alt: "A".repeat(250), width: 1080, height: 720, addedAt: "2026-10-01", credit: { by: "Shlok", byUrl: "https://www.pexels.com/@shlok", url: "" } },
      { key: "cimg-bbbbbb2", name: "7", folder: "", alt: "", width: 0, height: 0, addedAt: "" },
    ]);
    store.set("cs-media-u1", "{not json");
    expect(loadMedia("u1")).toEqual([]);
    expect(loadMedia(null)).toEqual([]);
  });

  it("pinned: a full library drops its oldest picture when another is added", () => {
    for (let i = 0; i < 300; i++) addMedia("u1", item(`cimg-p${String(i).padStart(5, "0")}`));
    addMedia("u1", item("cimg-newest1"));
    const keys = loadMedia("u1").map((m) => m.key);
    expect(keys).toHaveLength(300);
    expect(keys[0]).toBe("cimg-newest1");
    expect(keys).not.toContain("cimg-p00000");
  });

  it("keeps a stock photo's credit, only with Pexels links", async () => {
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
