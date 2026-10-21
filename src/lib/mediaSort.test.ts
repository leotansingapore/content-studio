import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The queue with the server, the device files and the frame grabs faked: how many run at once, and what lands.
const fake = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  inFlight: 0,
  most: 0,
  answer: (_b: Record<string, unknown>): Promise<unknown> => Promise.resolve({ alt: "A blue wordmark", type: "logo" }),
}));
vi.mock("@/lib/edgeFn", () => {
  class EdgeError extends Error {
    constructor(message: string, public status: number, public code = "") {
      super(message);
    }
  }
  return {
    EdgeError,
    callFn: async (_name: string, body: Record<string, unknown>) => {
      fake.calls.push(body);
      fake.inFlight++;
      fake.most = Math.max(fake.most, fake.inFlight);
      await new Promise((r) => setTimeout(r, 5));
      try {
        return await fake.answer(body);
      } finally {
        fake.inFlight--;
      }
    },
  };
});
vi.mock("@/lib/deviceFiles", () => ({ getFile: async (k: string) => (k.includes("gone") ? undefined : new Blob(["x"])), putFile: async () => undefined }));
vi.mock("@/lib/videoMedia", () => ({
  stills: async () => ["data:image/jpeg;base64,VIDEO"],
  thumbOf: async () => "data:image/jpeg;base64,PHOTO",
}));

import { EdgeError } from "@/lib/edgeFn";
import { addMedia, loadMedia, updateMedia } from "@/lib/mediaLibrary";
import { onSortChange, SORT_USED_UP, sortMedia, sortState, waitingSort } from "@/lib/mediaSort";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
  fake.calls.length = 0;
  fake.most = 0;
  fake.answer = () => Promise.resolve({ alt: "A blue wordmark", type: "logo" });
});
afterEach(() => vi.unstubAllGlobals());

const item = (key: string, over: Record<string, unknown> = {}) => ({ key, name: key, folder: "", alt: "", width: 1080, height: 1080, addedAt: "2026-10-21", kind: "photo" as const, ...over });
const settled = () => new Promise<void>((resolve) => {
  if (!sortState().sorting.size) return resolve();
  const off = onSortChange(() => {
    if (!sortState().sorting.size) {
      off();
      resolve();
    }
  });
});

describe("media sort queue", () => {
  it("sorts every file, 3 at a time, and marks each tile until its answer lands", async () => {
    const keys = ["cimg-aaaaa01", "cimg-aaaaa02", "cimg-aaaaa03", "cimg-aaaaa04", "cvid-aaaaa05"];
    for (const k of keys) addMedia("u1", item(k, k.startsWith("cvid-") ? { kind: "video", seconds: 24 } : {}));
    sortMedia("u1", keys);
    sortMedia("u1", keys); // queued twice: sorted once
    expect([...sortState().sorting].sort()).toEqual(keys);
    await settled();
    expect(fake.calls).toHaveLength(5);
    expect(fake.most).toBe(3);
    expect(loadMedia("u1", { videos: true }).every((m) => m.type === "logo" && m.typeBy === "ai" && m.alt === "A blue wordmark")).toBe(true);
    expect(fake.calls.find((c) => c.kind === "video")).toMatchObject({ mode: "sort", still: "data:image/jpeg;base64,VIDEO", seconds: 24, width: 1080, height: 1080 });
    expect(fake.calls.find((c) => c.kind === "photo")).toMatchObject({ still: "data:image/jpeg;base64,PHOTO" });
  });

  it("never replaces a type the person picked while it waited, and keeps alt text they had", async () => {
    addMedia("u1", item("cimg-bbbbb01", { alt: "Pexels' own words" }));
    addMedia("u1", item("cimg-bbbbb02"));
    sortMedia("u1", ["cimg-bbbbb01", "cimg-bbbbb02"]);
    updateMedia("u1", "cimg-bbbbb02", { type: "person", typeBy: "you" });
    await settled();
    const [two, one] = loadMedia("u1");
    expect(one).toMatchObject({ type: "logo", alt: "Pexels' own words" });
    expect(two).toMatchObject({ type: "person", typeBy: "you", alt: "A blue wordmark" });
  });

  it("lands as other with no message when the read fails, the account isn't on, or the file is gone", async () => {
    fake.answer = (b) => Promise.reject(new EdgeError(b.name === "cimg-ccccc01" ? "Couldn't sort that file." : "This isn't switched on for your account yet.", b.name === "cimg-ccccc01" ? 502 : 403, b.name === "cimg-ccccc01" ? "failed" : "not_enabled"));
    for (const k of ["cimg-ccccc01", "cimg-ccccc02", "cimg-gone0003"]) addMedia("u1", item(k));
    sortMedia("u1", ["cimg-ccccc01", "cimg-ccccc02", "cimg-gone0003"]);
    await settled();
    expect(loadMedia("u1").map((m) => [m.type, m.alt])).toEqual([["other", ""], ["other", ""], ["other", ""]]);
    expect(fake.calls).toHaveLength(2);
    expect(sortState().notice).toBeNull();
  });

  it("says once when sorting is used up, and sends nothing more today", async () => {
    fake.answer = () => Promise.reject(new EdgeError("You've used today's 200.", 429, "daily_limit"));
    for (const k of ["cimg-ddddd01", "cimg-ddddd02", "cimg-ddddd03", "cimg-ddddd04", "cimg-ddddd05"]) addMedia("u1", item(k));
    sortMedia("u1", ["cimg-ddddd01", "cimg-ddddd02", "cimg-ddddd03", "cimg-ddddd04", "cimg-ddddd05"]);
    await settled();
    expect(sortState().notice).toBe(SORT_USED_UP);
    expect(fake.calls).toHaveLength(3); // the first three were already on their way
    expect(loadMedia("u1").every((m) => m.type === "other")).toBe(true);
  });

  it("finds the uploads a reload stopped, and none of today's photos", () => {
    const list = [item("cimg-eeeee01"), item("cimg-eeeee02", { type: "logo" }), { ...item("cimg-eeeee03"), kind: undefined }];
    expect(waitingSort(list)).toEqual(["cimg-eeeee01"]);
  });
});
