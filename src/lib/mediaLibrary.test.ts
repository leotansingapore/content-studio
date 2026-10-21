import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addMedia, applySort, filterMedia, foldersOf, loadMedia, mediaRoom, removeMedia, updateMedia } from "@/lib/mediaLibrary";

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

  it("loads cvid- videos only for a caller that asks, so photo pickers never see them", () => {
    addMedia("u1", item("cimg-aaaaaa1"));
    addMedia("u1", { ...item("cvid-bbbbbb2"), kind: "video", seconds: 24.04, bytes: 3_000_000 });
    expect(loadMedia("u1").map((m) => m.key)).toEqual(["cimg-aaaaaa1"]);
    expect(loadMedia("u1", { videos: true })).toEqual([
      { ...item("cvid-bbbbbb2"), kind: "video", seconds: 24.04, bytes: 3_000_000 },
      item("cimg-aaaaaa1"),
    ]);
  });

  it("drops unknown types, a who-set without a type, and a video's fields on a photo", () => {
    store.set("cs-media-u1", JSON.stringify([
      { ...item("cimg-aaaaaa1"), kind: "photo", type: "logo", typeBy: "you" },
      { ...item("cimg-bbbbbb2"), kind: "video", type: "selfie", typeBy: "ai", seconds: 9, demo: { start: 0, end: 10, shows: "x" } },
      { ...item("cvid-cccccc3"), type: "screen", typeBy: "robot", seconds: -2, bytes: "big" },
    ]));
    expect(loadMedia("u1", { videos: true })).toEqual([
      { ...item("cimg-aaaaaa1"), kind: "photo", type: "logo", typeBy: "you" },
      item("cimg-bbbbbb2"),
      { ...item("cvid-cccccc3"), kind: "video", type: "screen" },
    ]);
  });

  it("clamps a demo's window into the file: 0 or more, within its length, 3 to 30 seconds", () => {
    const demo = (d: Record<string, unknown>, seconds = 120) => {
      store.set("cs-media-u1", JSON.stringify([{ ...item("cvid-dddddd4"), seconds, demo: { shows: "A budget sheet", ...d } }]));
      return loadMedia("u1", { videos: true })[0].demo;
    };
    expect(demo({ start: 20, end: 50, flags: ["returns", "made-up"] })).toEqual({ start: 20, end: 50, shows: "A budget sheet", flags: ["returns"] });
    expect(demo({ start: -5, end: 10 })).toMatchObject({ start: 0, end: 10 });
    expect(demo({ start: 100, end: 200 })).toMatchObject({ start: 100, end: 120 });
    expect(demo({ start: 10, end: 90 })).toMatchObject({ start: 10, end: 40 });
    expect(demo({ start: 10, end: 11 })).toMatchObject({ start: 10, end: 13 });
    expect(demo({ start: 119, end: 120 })).toMatchObject({ start: 117, end: 120 });
    expect(demo({ start: 0, end: 2 }, 2)).toBeUndefined();
    expect(demo({ start: 0, end: 30, shows: "s".repeat(130) })!.shows).toHaveLength(120);
    expect(demo({ start: 0, end: 20 }).flags).toBeUndefined();
  });

  it("filters by kind and type, an unsorted file counting as other, with today's three arguments unchanged", () => {
    const list = [
      { ...item("cimg-a00001", { name: "Logo" }), kind: "photo" as const, type: "logo" as const },
      { ...item("cvid-a00002", { name: "Walk" }), kind: "video" as const, type: "footage" as const },
      item("cimg-a00003", { name: "Old photo" }),
    ];
    expect(filterMedia(list, "", "").map((m) => m.name)).toEqual(["Logo", "Walk", "Old photo"]);
    expect(filterMedia(list, "", "", { kind: "photos" }).map((m) => m.name)).toEqual(["Logo", "Old photo"]);
    expect(filterMedia(list, "", "", { kind: "videos" }).map((m) => m.name)).toEqual(["Walk"]);
    expect(filterMedia(list, "", "", { type: "footage" }).map((m) => m.name)).toEqual(["Walk"]);
    expect(filterMedia(list, "", "", { type: "other" }).map((m) => m.name)).toEqual(["Old photo"]);
    expect(filterMedia(list, "old", "", { kind: "photos", type: "other" }).map((m) => m.name)).toEqual(["Old photo"]);
  });

  it("a sort answer never replaces a type the person picked, and fills alt text only where there is none", () => {
    addMedia("u1", { ...item("cimg-aaaaaa1"), kind: "photo" });
    addMedia("u1", { ...item("cimg-bbbbbb2", { alt: "Pexels' own words" }), kind: "photo" });
    updateMedia("u1", "cimg-aaaaaa1", { type: "person", typeBy: "you" });
    applySort("u1", "cimg-aaaaaa1", { type: "logo", alt: "A man at a desk" });
    applySort("u1", "cimg-bbbbbb2", { type: "footage", alt: "A city street" });
    const [b, a] = loadMedia("u1");
    expect(a).toMatchObject({ type: "person", typeBy: "you", alt: "A man at a desk" });
    expect(b).toMatchObject({ type: "footage", typeBy: "ai", alt: "Pexels' own words" });
  });

  it("refuses the 301st upload instead of dropping the oldest, and never drops an upload to make room", () => {
    addMedia("u1", { ...item("cvid-oldest1"), kind: "video" });
    for (let i = 0; i < 299; i++) addMedia("u1", item(`cimg-p${String(i).padStart(5, "0")}`));
    expect(mediaRoom("u1")).toBe(0);
    addMedia("u1", { ...item("cimg-upload1"), kind: "photo" });
    let keys = loadMedia("u1", { videos: true }).map((m) => m.key);
    expect(keys).toHaveLength(300);
    expect(keys).not.toContain("cimg-upload1");
    expect(keys.at(-1)).toBe("cvid-oldest1");
    // another writer (an AI picture) still adds, by dropping the oldest picture that wasn't uploaded
    addMedia("u1", item("cimg-aipic01"));
    keys = loadMedia("u1", { videos: true }).map((m) => m.key);
    expect(keys[0]).toBe("cimg-aipic01");
    expect(keys).toContain("cvid-oldest1");
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
