import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/stockMedia", () => ({ searchStock: vi.fn(), downloadStock: vi.fn() }));
vi.mock("@/lib/deviceFiles", () => ({ putFile: vi.fn(async () => {}) }));
vi.mock("@/lib/videoMedia", () => ({ loadVideo: vi.fn(async () => { throw new Error("no video element in node"); }) }));
vi.mock("@/lib/videoProjects", () => ({ loadProjects: vi.fn(() => []), saveProject: vi.fn() }));

import { callFn } from "@/lib/edgeFn";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import type { Broll } from "@/lib/videoEdit";
import { brollJob, brollSpan, chooseClip, onBrollApply, startAutoBroll, stockIdOf } from "./autoBroll";

const item = (id: string, w: number, h: number, duration?: number): StockItem => ({ id, w, h, duration, alt: "", thumb: `https://images.pexels.com/${id}.jpg`, src: `https://videos.pexels.com/${id}.mp4`, by: "Ann", byUrl: "", url: "" });
const line = (s: number, e: number, text = "A line here.") => ({ s, e, text });

describe("placing a cutaway over a line", () => {
  it("runs from the line's start, 2 to 5 s, clear of the next pick and the end", () => {
    expect(brollSpan(line(4.26, 7), null, 60)).toEqual({ from: 4.2, to: 7 });
    expect(brollSpan(line(4, 5), null, 60)).toEqual({ from: 4, to: 6 });
    expect(brollSpan(line(4, 12), null, 60)).toEqual({ from: 4, to: 9 });
    expect(brollSpan(line(4, 12), 7, 60)).toEqual({ from: 4, to: 6.8 });
    expect(brollSpan(line(58.5, 62), null, 59)).toBeNull();
  });
  it("reads the Pexels id out of a clip's file key", () => {
    expect(stockIdOf("br-1234567-mgx1a2")).toBe("1234567");
    expect(stockIdOf("bd-x")).toBeNull();
  });
});

describe("choosing the clip", () => {
  const items = [item("1", 1080, 1920, 10), item("2", 1920, 1080, 10), item("3", 1080, 1920, 2), item("4", 1080, 1920, 8)];
  it("skips clips on the video already, the wrong way up, or too short", () => {
    expect(chooseClip(items, new Set(), 4, "portrait")?.id).toBe("1");
    expect(chooseClip(items, new Set(["1"]), 4, "portrait")?.id).toBe("4");
    expect(chooseClip(items, new Set(), 4, "landscape")?.id).toBe("2");
    expect(chooseClip(items, new Set(["1", "4"]), 4, "portrait")).toBeNull();
  });
});

describe("the job", () => {
  it("never uses one clip twice and hands all the clips to the open editor as one change", async () => {
    const sentences = [line(0, 3, "Hook."), line(6, 9, "Buy a home."), line(14, 18, "Save in a jar."), line(24, 27, "Plan for kids.")];
    vi.mocked(callFn).mockResolvedValueOnce({ picks: [{ i: 1, search: "home" }, { i: 2, search: "jar" }, { i: 3, search: "kids" }] });
    // every search answers with the same two clips, so the third line has none left
    vi.mocked(searchStock).mockResolvedValue({ items: [item("11", 1080, 1920, 10), item("12", 1080, 1920, 10)], more: false });
    vi.mocked(downloadStock).mockResolvedValue(new Blob(["x"]));
    const applied: Broll[][] = [];
    const off = onBrollApply("p1", (added) => applied.push(added));
    await startAutoBroll("u1", { projectId: "p1", sentences, total: 30, hookSeconds: 0, existing: [], orientation: "portrait" });
    off();
    expect(applied).toHaveLength(1);
    expect(applied[0].map((b) => stockIdOf(b.key))).toEqual(["11", "12"]);
    expect(applied[0].map((b) => [b.from, b.to])).toEqual([[6, 9], [14, 18]]);
    expect(brollJob()).toMatchObject({ state: "done", done: 3, of: 3, missed: ["kids"] });
  });
  it("says so when Jev had no answer, and places nothing", async () => {
    vi.mocked(callFn).mockResolvedValueOnce({ picks: null });
    await startAutoBroll("u1", { projectId: "p2", sentences: [line(0, 3), line(5, 8)], total: 10, hookSeconds: 0, existing: [], orientation: "portrait" });
    expect(brollJob()).toMatchObject({ state: "failed", placed: [] });
  });
});
