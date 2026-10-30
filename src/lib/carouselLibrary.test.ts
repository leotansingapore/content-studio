import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRENDING_DAYS,
  activeCount,
  addFolder,
  addSearch,
  ago,
  applyFilters,
  compact,
  filtersFrom,
  likeTerm,
  loadCarouselFit,
  loadShelf,
  multipleLabel,
  rankByFit,
  remixText,
  removeFolder,
  saveCarouselFit,
  saveShelf,
  searchName,
  searchQuery,
  tierOf,
  toggleSaved,
  toggleTracked,
  type CarouselCard,
  type Query,
  type Shelf,
} from "./carouselLibrary";
import { fromCarousel, sourceKey } from "./remixSource";

/** Records every builder call, so a test reads the query the filters make. */
class Recorder implements Query<Recorder> {
  calls: [string, ...unknown[]][] = [];
  private add(...c: [string, ...unknown[]]) {
    this.calls.push(c);
    return this;
  }
  eq(c: string, v: string) { return this.add("eq", c, v); }
  gte(c: string, v: string | number) { return this.add("gte", c, v); }
  lte(c: string, v: string | number) { return this.add("lte", c, v); }
  in(c: string, v: string[]) { return this.add("in", c, v); }
  not(c: string, op: string, v: string) { return this.add("not", c, op, v); }
  ilike(c: string, p: string) { return this.add("ilike", c, p); }
  order(c: string, o: { ascending: boolean }) { return this.add("order", c, o.ascending); }
}
const query = (qs: string, now = Date.parse("2026-10-30T00:00:00Z")) => applyFilters(new Recorder(), filtersFrom(new URLSearchParams(qs)), now).calls;

const empty = (): Shelf => ({ folders: [], saved: [], tracked: [], searches: [] });
const card = (id: string, multiple: number): CarouselCard => ({
  id, ig_url: "https://www.instagram.com/p/x/", creator: "a", title: id, topic: "Business", format: "List", slides: 5,
  likes: 10, comments: 1, engagements: 11, multiple, baseline: 5, posted_at: "2026-10-01T00:00:00Z", imported_at: "2026-10-02T00:00:00Z",
});

describe("filters from the address", () => {
  it("defaults to every outlier, newest first", () => {
    expect(query("")).toEqual([["order", "posted_at", false], ["order", "id", true]]);
    expect(activeCount(filtersFrom(new URLSearchParams("")))).toBe(0);
  });

  it("turns every filter into the query, and ignores values that aren't on the lists", () => {
    const calls = query("q=50%25 off&topic=Business&format=List&smin=2&smax=10&emin=100&lmin=3&lmax=9&days=30&hide=Design,Bogus&creator=some.creator&sort=engagement");
    expect(calls).toEqual([
      ["ilike", "search", "%50\\% off%"],
      ["eq", "topic", "Business"],
      ["eq", "format", "List"],
      ["eq", "creator", "some.creator"],
      ["gte", "multiple", "2"],
      ["lte", "multiple", "10"],
      ["gte", "engagements", "100"],
      ["gte", "slides", "3"],
      ["lte", "slides", "9"],
      ["gte", "posted_at", "2026-09-30T00:00:00.000Z"],
      ["not", "topic", "in", '("Design")'],
      ["order", "engagements", false],
      ["order", "posted_at", false],
      ["order", "id", true],
    ]);
    expect(query("topic=Nope&format=Nope&smin=abc&days=3&creator=bad handle&sort=nope")).toEqual([["order", "posted_at", false], ["order", "id", true]]);
  });

  it("Trending this week is the last 14 days, biggest multiple first", () => {
    expect(query("view=trending")).toEqual([
      ["gte", "posted_at", new Date(Date.parse("2026-10-30T00:00:00Z") - TRENDING_DAYS * 86_400_000).toISOString()],
      ["order", "multiple", false],
      ["order", "posted_at", false],
      ["order", "id", true],
    ]);
  });

  it("brings the biggest outliers for Best for your brand to rank on the device", () => {
    expect(query("sort=brand")).toEqual([["order", "multiple", false], ["order", "posted_at", false], ["order", "id", true]]);
    expect(query("sort=oldest")).toEqual([["order", "posted_at", true], ["order", "id", true]]);
  });

  it("escapes a search term's own wildcards", () => {
    expect(likeTerm(" A_b\\c% ")).toBe("%a\\_b\\\\c\\%%");
  });

  it("saves only the search's own params, in one order", () => {
    expect(searchQuery(new URLSearchParams("size=large&view=saved&topic=Business&q=hooks&folder=f1"))).toBe("q=hooks&topic=Business");
    expect(searchName(filtersFrom(new URLSearchParams("topic=Business&format=List&smin=4")))).toBe("Business, List, 4x+");
    expect(searchName(filtersFrom(new URLSearchParams("")))).toBe("All outliers");
  });
});

describe("what a card shows", () => {
  it("colours the multiple the way Top Carousels does", () => {
    expect([1.2, 2, 4.5, 6, 10, 55.7].map((m) => tierOf(m).label)).toEqual(["Typical", "Outlier", "Strong", "Exceptional", "Breakout", "Breakout"]);
    expect([3.5, 55.7, 3023.3].map(multipleLabel)).toEqual(["3.5x", "55.7x", "3023x"]);
  });

  it("writes numbers and ages short", () => {
    expect([940, 2400, 20419, 3104759].map(compact)).toEqual(["940", "2.4K", "20K", "3.1M"]);
    const now = Date.parse("2026-10-30T00:00:00Z");
    expect(["2026-10-29T12:00:00Z", "2026-10-24T00:00:00Z", "2026-10-01T00:00:00Z", "2026-03-01T00:00:00Z", "2018-12-10T00:00:00Z"].map((d) => ago(d, now))).toEqual(["today", "6d ago", "4w ago", "8mo ago", "7y ago"]);
  });
});

describe("the shelf", () => {
  it("saves, moves to a folder and un-saves", () => {
    let s = toggleSaved(empty(), "c1");
    expect(s.saved.map((x) => [x.id, x.folder])).toEqual([["c1", null]]);
    const { shelf, id } = addFolder(s, "  Hooks   to steal ");
    expect(shelf.folders).toEqual([{ id, name: "Hooks to steal" }]);
    s = toggleSaved(shelf, "c1", id);
    expect(s.saved.map((x) => [x.id, x.folder])).toEqual([["c1", id]]);
    expect(toggleSaved(s, "c1", id).saved).toEqual([]);
  });

  it("keeps one folder per name, and a removed folder's carousels stay saved", () => {
    const a = addFolder(empty(), "Hooks");
    expect(addFolder(a.shelf, "hooks").id).toBe(a.id);
    expect(addFolder(a.shelf, "   ").id).toBeNull();
    const s = removeFolder(toggleSaved(a.shelf, "c1", a.id), a.id!);
    expect(s.folders).toEqual([]);
    expect(s.saved.map((x) => x.folder)).toEqual([null]);
  });

  it("tracks a creator once, with or without the @", () => {
    const s = toggleTracked(toggleTracked(empty(), "@some.creator"), "other");
    expect(s.tracked).toEqual(["other", "some.creator"]);
    expect(toggleTracked(s, "some.creator").tracked).toEqual(["other"]);
  });

  it("keeps one saved search per query, newest first", () => {
    const s = addSearch(addSearch(addSearch(empty(), "Business", "topic=Business"), "List", "format=List"), "Business again", "topic=Business");
    expect(s.searches.map((x) => x.name)).toEqual(["Business again", "List"]);
    expect(addSearch(empty(), "", "topic=Business").searches).toEqual([]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("is kept under the synced prefix, per brand, and survives bad storage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    expect(saveShelf("u1", toggleSaved(empty(), "c1"))).toBe(true);
    expect([...store.keys()].every((k) => k.startsWith("content-studio-carousels-"))).toBe(true);
    expect(loadShelf("u1").saved.map((x) => x.id)).toEqual(["c1"]);
    store.set([...store.keys()][0], "{not json");
    expect(loadShelf("u1")).toEqual(empty());
  });
});

describe("Best for your brand", () => {
  afterEach(() => vi.unstubAllGlobals());
  const input = { serves: "Coaches", sells: "Coaching", topics: ["Habits"] };

  it("keeps the answer on this device for 7 days, for this brand's input only", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const now = Date.parse("2026-10-30T00:00:00Z");
    saveCarouselFit("u1", input, { fit: { c1: 0.9 }, topics: ["Business"] }, now);
    expect([...store.keys()].every((k) => k.startsWith("cs-carousel-fit-"))).toBe(true);
    expect(loadCarouselFit("u1", input, now + 86_400_000)).toEqual({ fit: { c1: 0.9 }, topics: ["Business"] });
    expect(loadCarouselFit("u1", { ...input, serves: "Lawyers" }, now)).toBeNull();
    expect(loadCarouselFit("u1", input, now + 7 * 86_400_000)).toBeNull();
  });

  it("ranks by fit, the bigger multiple first on a tie, and leaves out what Jev didn't score", () => {
    const rows = [card("a", 2), card("b", 9), card("c", 5), card("d", 50)];
    expect(rankByFit(rows, { a: 0.4, b: 0.9, c: 0.9 }).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});

describe("remix", () => {
  it("reads the title, every slide's words and the caption, at most 2000 characters", () => {
    expect(remixText({ title: "5 habits", slide_text: ["5 habits\nthat work", "", "1. Plan"], caption: "Save this" })).toBe(
      "5 habits\nSlide 1: 5 habits that work\nSlide 3: 1. Plan\nCaption: Save this",
    );
    expect(remixText({ title: "t", slide_text: [], caption: "x".repeat(3000) })).toHaveLength(2000);
  });

  it("snapshots a library carousel as an Instagram carousel by its creator", () => {
    const s = fromCarousel({ ...card("c1", 3.4), creator: "some.creator", caption: "Long caption", slide_text: ["The hook line"], slide_count: 5, video_positions: [], flags: [] }, "https://x.supabase.co/storage/v1/object/public/cs-carousels/c1/cover.webp");
    expect(s).toMatchObject({
      key: sourceKey.carousel("c1"),
      kind: "top-post",
      format: "carousel",
      platform: "instagram",
      author: "@some.creator",
      title: "c1",
      numbers: { likes: 10, comments: 1, ratio: 3.4 },
      teardown: { hook: "The hook line", structure: "List, 5 slides" },
      remixedAt: "",
    });
    expect(s.key).toBe("carousel:c1");
  });
});
