import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StockItem } from "@/lib/stockMedia";

const files = vi.hoisted(() => new Map<string, Blob>());
const stock = vi.hoisted(() => ({
  searches: [] as { kind: string; query: string; orientation?: string }[],
  results: {} as Record<string, StockItem[]>,
  refuse: null as Error | null,
  broken: new Set<string>(),
}));
vi.mock("@/lib/deviceFiles", () => ({
  putFile: async (k: string, b: Blob) => void files.set(k, b),
  deleteFile: async (k: string) => void files.delete(k),
  getFile: async (k: string) => files.get(k),
}));
vi.mock("@/lib/stockMedia", () => ({
  searchStock: async (kind: string, query: string, _page: number, orientation?: string) => {
    stock.searches.push({ kind, query, orientation });
    if (stock.refuse) throw stock.refuse;
    return { items: stock.results[query] ?? [], more: false };
  },
  downloadStock: async (url: string) => {
    if (stock.broken.has(url)) throw new Error("Couldn't download it. Try another one.");
    return new Blob([url]);
  },
}));
vi.mock("@/lib/mediaLibrary", async (actual) => {
  const real = await actual<typeof import("@/lib/mediaLibrary")>();
  let n = 0;
  return {
    ...real,
    // the real one draws on a canvas; here each picture just gets a fresh cimg- key
    storePicture: async (b: Blob, maxWidth = 1080) => {
      const key = `cimg-t${String(++n).padStart(6, "0")}`;
      files.set(key, b);
      return { key, url: "data:", width: Math.min(maxWidth, 1080), height: 1350 };
    },
  };
});

import { STARTER_SETS } from "@/data/starterSets";
import { AI_FOLDER } from "@/lib/aiImage";
import { addMedia, loadMedia, MAX_MEDIA, type MediaItem } from "@/lib/mediaLibrary";
import { FULL_LINE } from "@/lib/mediaUpload";
import { describe as describeClip } from "@/lib/montage";
import {
  addable, addStarter, addToSet, loadSets, makeSet, nameLine, pickStarter, removeSet, renameSet, restoreSet, rotateCandidates, saveSets, setsWith,
  starterAdded, starterJobs, usableSets, type MediaSet,
} from "@/lib/mediaSets";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  files.clear();
  stock.searches.length = 0;
  stock.results = {};
  stock.refuse = null;
  stock.broken.clear();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    dispatchEvent: () => true,
  });
});
afterEach(() => vi.unstubAllGlobals());

const U = "u1";
let seq = 0;
const item = (folder: string, over: Partial<MediaItem> = {}): MediaItem => ({
  key: `cimg-k${String(++seq).padStart(5, "0")}`, name: "Photo", folder, alt: "words", width: 1080, height: 1080, addedAt: `2026-10-${String(10 + (seq % 18)).padStart(2, "0")}T00:00:00.000Z`, ...over,
});
const put = (...list: MediaItem[]) => list.forEach((m) => addMedia(U, m));
const set = (name: string, kind: MediaSet["kind"] = "photos", starter?: string): MediaSet => ({ name, kind, ...(starter ? { starter } : {}), createdAt: "2026-10-01T00:00:00.000Z" });
const stockItem = (id: number, over: Partial<StockItem> = {}): StockItem => ({
  id: String(id), w: 1080, h: 1920, alt: `Stock ${id}`, thumb: `https://images.pexels.com/t/${id}.jpg`, src: `https://images.pexels.com/p/${id}.jpg`, by: "Ann", byUrl: "https://www.pexels.com/@ann", url: `https://www.pexels.com/photo/stock-${id}/`, ...over,
});
const range = (from: number, n: number, over: (id: number) => Partial<StockItem> = () => ({})) => Array.from({ length: n }, (_, i) => stockItem(from + i, over(from + i)));

describe("set records", () => {
  it("live on this device per profile and drop junk, AI images and repeats", () => {
    saveSets(U, [set("Office"), set("City clips", "clips", "city-clips")]);
    expect([...store.keys()]).toEqual(["cs-media-sets-u1"]);
    expect(loadSets(U)).toEqual([set("Office"), set("City clips", "clips", "city-clips")]);
    store.set("cs-media-sets-u1", JSON.stringify([set("A"), { name: "AI images", kind: "photos" }, { name: "a", kind: "photos" }, { name: "B", kind: "films" }, null, 5]));
    expect(loadSets(U).map((s) => s.name)).toEqual(["A"]);
    store.set("cs-media-sets-u1", "{not json");
    expect(loadSets(U)).toEqual([]);
    expect(loadSets(null)).toEqual([]);
  });

  it("refuses a set named AI images, a blank name and a repeat", () => {
    expect(makeSet(U, "AI images", "photos")).toEqual({ ok: false, line: "AI images keeps your AI pictures. Pick another name." });
    expect(makeSet(U, "  ai IMAGES ", "photos").ok).toBe(false);
    expect(makeSet(U, " ", "photos")).toEqual({ ok: false, line: "Give the set a name." });
    expect(makeSet(U, "My office", "photos").ok).toBe(true);
    expect(makeSet(U, "my office", "clips")).toEqual({ ok: false, line: "You already have a set called my office." });
    expect(loadSets(U).map((s) => [s.name, s.kind])).toEqual([["My office", "photos"]]);
  });

  it("counts files of the set's kind per folder and takes the newest as the cover", () => {
    const old = item("Office", { addedAt: "2026-10-01T00:00:00.000Z" });
    const newest = item("Office", { addedAt: "2026-10-09T00:00:00.000Z", alt: "" });
    const clip = item("Office", { key: "cvid-v00001", kind: "video", seconds: 5 });
    const other = item("Home");
    const out = setsWith([set("Office"), set("Office clips", "clips"), set("Empty")], [old, clip, newest, other]);
    expect(out.map((s) => [s.name, s.count, s.cover?.key ?? null, s.undescribed])).toEqual([["Office", 2, newest.key, 1], ["Office clips", 0, null, 0], ["Empty", 0, null, 0]]);
  });

  it("leaves sets under 3 and sets of the other kind out of the build pickers", () => {
    saveSets(U, [set("Three"), set("Two"), set("Clips", "clips")]);
    put(item("Three"), item("Three"), item("Three"), item("Two"), item("Two"), ...[1, 2, 3].map((i) => item("Clips", { key: `cvid-c0000${i}`, kind: "video" })));
    expect(usableSets(U, "photos").map((s) => s.name)).toEqual(["Three"]);
    expect(usableSets(U, "clips").map((s) => [s.name, s.count])).toEqual([["Clips", 3]]);
  });
});

describe("rename, remove and add", () => {
  beforeEach(() => {
    saveSets(U, [set("Office"), set("Home")]);
    put(item("Office"), item("Office"), item("Home"), item(""), item(AI_FOLDER), item(AI_FOLDER));
  });
  const folders = () => loadMedia(U, { videos: true }).map((m) => m.folder).sort();

  it("renames only that folder's files", () => {
    expect(renameSet(U, "Office", "Desk")).toEqual({ ok: true });
    expect(loadSets(U).map((s) => s.name)).toEqual(["Desk", "Home"]);
    expect(folders()).toEqual(["", AI_FOLDER, AI_FOLDER, "Desk", "Desk", "Home"]);
    expect(renameSet(U, "Desk", "AI images").ok).toBe(false);
    expect(renameSet(U, "Desk", "Home")).toEqual({ ok: false, line: "You already have a set called Home." });
    expect(folders()).toEqual(["", AI_FOLDER, AI_FOLDER, "Desk", "Desk", "Home"]);
  });

  it("removes only that set, keeps every file, and Undo puts it back", () => {
    const before = loadMedia(U, { videos: true }).length;
    const removed = removeSet(U, "Office")!;
    expect(removed.keys).toHaveLength(2);
    expect(loadSets(U).map((s) => s.name)).toEqual(["Home"]);
    expect(loadMedia(U, { videos: true })).toHaveLength(before);
    expect(folders()).toEqual(["", "", "", AI_FOLDER, AI_FOLDER, "Home"]);
    restoreSet(U, removed);
    expect(loadSets(U).map((s) => s.name).sort()).toEqual(["Home", "Office"]);
    expect(folders()).toEqual(["", AI_FOLDER, AI_FOLDER, "Home", "Office", "Office"]);
  });

  it("never offers or moves an AI picture into a set", () => {
    const all = loadMedia(U, { videos: true });
    expect(addable(all, set("Home")).map((m) => m.folder).sort()).toEqual(["", "Office", "Office"]);
    const ai = all.filter((m) => m.folder === AI_FOLDER).map((m) => m.key);
    const loose = all.find((m) => !m.folder)!.key;
    expect(addToSet(U, "Home", [...ai, loose])).toBe(1);
    expect(loadMedia(U, { videos: true }).filter((m) => m.folder === AI_FOLDER).map((m) => m.key).sort()).toEqual(ai.sort());
    expect(loadMedia(U, { videos: true }).find((m) => m.key === loose)?.folder).toBe("Home");
    // no set action moves one either: renaming or removing a set only touches its own folder
    renameSet(U, "Home", "Family");
    removeSet(U, "Family");
    expect(loadMedia(U, { videos: true }).filter((m) => m.folder === AI_FOLDER)).toHaveLength(2);
  });
});

describe("rotation", () => {
  it("gives every photo of a 20-photo set a place among 4 scenes' candidates, 12 at most a scene", () => {
    const photos = Array.from({ length: 20 }, (_, i) => i);
    const scenes = rotateCandidates(photos, 4);
    expect(scenes.every((c) => c.length === 12)).toBe(true);
    expect(new Set(scenes.flat()).size).toBe(20);
    expect(rotateCandidates([1, 2, 3], 3)).toEqual([[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
  });
});

describe("starter sets", () => {
  const money = STARTER_SETS.find((s) => s.id === "money")!;
  const city = STARTER_SETS.find((s) => s.id === "city-clips")!;

  it("takes an even share per query, tops up from the next and stops at the count", () => {
    const results = [range(1, 10), range(20, 2), range(40, 10)];
    const picks = pickStarter(results, 12, new Set());
    expect(picks).toHaveLength(12);
    expect(picks.map((p) => p.query)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2]);
    expect(pickStarter([range(1, 2), range(20, 2)], 8, new Set()).length).toBe(4);
    // clips split 3, 3 and 2 over three queries
    expect(pickStarter([range(1, 9), range(20, 9), range(40, 9)], 8, new Set()).map((p) => p.query)).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
  });

  it("adds 12 portrait photos with their credit and alt text, typed so none waits for a paid sort", async () => {
    money.queries.forEach((q, i) => (stock.results[q] = range(i * 100, 10)));
    put(item("", { credit: { by: "Ann", byUrl: "", url: "https://www.pexels.com/photo/stock-1/" } }));
    const job = await addStarter(U, "money");
    expect(stock.searches).toEqual(money.queries.map((query) => ({ kind: "photo", query, orientation: "portrait" })));
    expect(job).toMatchObject({ done: true, n: 12, of: 12, line: "Money and budgeting added. 12 photos, credits kept." });
    const added = loadMedia(U, { videos: true }).filter((m) => m.folder === "Money and budgeting");
    expect(added).toHaveLength(12);
    expect(added.some((m) => m.credit?.url === "https://www.pexels.com/photo/stock-1/")).toBe(false);
    for (const m of added) expect(m).toMatchObject({ kind: "photo", type: "footage", credit: { by: "Ann" } });
    expect(added.every((m) => m.alt.startsWith("Stock ") && !m.typeBy)).toBe(true);
    expect(loadSets(U)).toEqual([expect.objectContaining({ name: "Money and budgeting", kind: "photos", starter: "money" })]);
    expect(starterAdded(loadSets(U), money)).toBe(true);
    expect(starterJobs().money.line).toBe(job!.line);
  });

  it("gives clips their page-name alt text, seconds and a still beside them", async () => {
    city.queries.forEach((q, i) => (stock.results[q] = range(i * 100 + 1, 6, (id) => ({ url: `https://www.pexels.com/video/city-night-traffic-${id}/`, duration: 7.333, alt: "" }))));
    const job = await addStarter(U, "city-clips");
    expect(stock.searches.map((s) => s.kind)).toEqual(["video", "video"]);
    expect(job?.line).toBe("City clips added. 8 clips, credits kept.");
    const clips = loadMedia(U, { videos: true }).filter((m) => m.folder === "City clips");
    expect(clips).toHaveLength(8);
    for (const m of clips) {
      expect(m).toMatchObject({ kind: "video", type: "footage", seconds: 7.33, alt: "city night traffic" });
      expect(m.alt).toBe(describeClip({ url: m.credit!.url }));
      expect(files.has(m.key) && files.has(`cimg-${m.key.slice(5)}`)).toBe(true);
    }
  });

  it("reports the files that didn't download and keeps the rest", async () => {
    money.queries.forEach((q, i) => (stock.results[q] = range(i * 100, 10)));
    stock.broken.add("https://images.pexels.com/p/1.jpg").add("https://images.pexels.com/p/101.jpg");
    const job = await addStarter(U, "money");
    expect(job?.line).toBe("Added 10 of 12. Some didn't download.");
    expect(loadMedia(U).filter((m) => m.folder === "Money and budgeting")).toHaveLength(10);
  });

  it("says why when stock search is used up, and adds nothing", async () => {
    stock.refuse = new Error("You've used all 100 for today. It resets at 8am Singapore time.");
    const job = await addStarter(U, "money");
    expect(job?.line).toBe("You've used all 100 for today. It resets at 8am Singapore time.");
    expect(loadMedia(U)).toEqual([]);
    expect(loadSets(U)).toEqual([]);
  });

  it("stops when Media is full, with the upload's line", async () => {
    money.queries.forEach((q, i) => (stock.results[q] = range(i * 100, 10)));
    store.set("cs-media-u1", JSON.stringify(Array.from({ length: MAX_MEDIA - 2 }, (_, i) => item("", { key: `cimg-f${String(i).padStart(5, "0")}`, kind: "photo" }))));
    const job = await addStarter(U, "money");
    expect(job?.line).toBe(`Added 2 of 12. ${FULL_LINE}`);
    expect(loadMedia(U)).toHaveLength(MAX_MEDIA);
  });
});
