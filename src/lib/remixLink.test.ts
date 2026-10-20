import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
const callFn = vi.fn();
vi.mock("@/lib/edgeFn", () => ({
  callFn: (...a: unknown[]) => callFn(...a),
  EdgeError: class EdgeError extends Error {
    constructor(message: string, readonly status: number, readonly code = "") {
      super(message);
    }
  },
}));
vi.mock("@/lib/reelFrames", () => ({ sampleVideoFrames: vi.fn() }));
vi.mock("@/lib/videoMedia", () => ({ extractWav: vi.fn() }));

import { EdgeError } from "@/lib/edgeFn";
import { REMIX_LINKS_PREFIX, resolveSource, type LinkedSource } from "./resolveSource";
import { NOT_KEPT, checkUpload, clearLinkRead, fitInside, linkRead, onLinkRead, saveLinkedSource, savedLinks, startLinkRead } from "./remixLink";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

let storage: MemStorage;
beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage() });
  vi.stubGlobal("localStorage", storage);
  callFn.mockReset();
  clearLinkRead();
});
afterEach(() => vi.unstubAllGlobals());

const linked = (key: string, over: Partial<LinkedSource> = {}): LinkedSource => ({
  key,
  kind: key.startsWith("upload:") ? "upload" : "link",
  platform: "instagram",
  title: `Post ${key}`,
  remixedAt: "",
  text: `Words of ${key}`,
  ...over,
});

describe("the picture scaler", () => {
  it("fits the long side to at most 1280 px and never enlarges", () => {
    expect(fitInside(4032, 3024)).toEqual({ w: 1280, h: 960 });
    expect(fitInside(1170, 2532)).toEqual({ w: 591, h: 1280 });
    expect(fitInside(800, 600)).toEqual({ w: 800, h: 600 });
    for (const [w, h] of [[5000, 10], [10, 5000], [1281, 1281]]) {
      const out = fitInside(w, h);
      expect(Math.max(out.w, out.h)).toBeLessThanOrEqual(1280);
      expect(Math.min(out.w, out.h)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("checking a picked file", () => {
  const MB = 1024 * 1024;
  it("takes JPG, PNG, WebP up to 8 MB and MP4 or MOV up to 80 MB", () => {
    expect(checkUpload({ type: "image/png", size: 2 * MB })).toEqual({ kind: "image" });
    expect(checkUpload({ type: "image/webp", size: 8 * MB })).toEqual({ kind: "image" });
    expect(checkUpload({ type: "video/quicktime", size: 79 * MB })).toEqual({ kind: "video" });
    expect(checkUpload({ type: "", size: MB, name: "clip.MP4" })).toEqual({ kind: "video" });
  });

  it("refuses wrong types and big files with the exact copy", () => {
    expect(checkUpload({ type: "application/pdf", size: MB, name: "a.pdf" })).toEqual({ error: "Upload a JPG, PNG, WebP, MP4 or MOV file." });
    expect(checkUpload({ type: "image/gif", size: MB })).toEqual({ error: "Upload a JPG, PNG, WebP, MP4 or MOV file." });
    expect(checkUpload({ type: "image/jpeg", size: 8 * MB + 1 })).toEqual({ error: "That file is over 8 MB. Trim it or take a screenshot." });
    expect(checkUpload({ type: "video/mp4", size: 80 * MB + 1 })).toEqual({ error: "That file is over 80 MB. Trim it or take a screenshot." });
  });
});

describe("the saved list", () => {
  it("keeps the newest 20: saving a 21st drops the oldest, and a repeat moves to the top", () => {
    for (let i = 1; i <= 21; i++) saveLinkedSource(UID, linked(`link:instagram:post${i}x`));
    const keys = savedLinks(UID).map((s) => s.key);
    expect(keys).toHaveLength(20);
    expect(keys[0]).toBe("link:instagram:post21x");
    expect(keys).not.toContain("link:instagram:post1x");
    saveLinkedSource(UID, linked("link:instagram:post5x"));
    expect(savedLinks(UID).map((s) => s.key).slice(0, 2)).toEqual(["link:instagram:post5x", "link:instagram:post21x"]);
    expect(savedLinks(UID)).toHaveLength(20);
  });

  it("is the store resolveSource reads: link: and upload: keys resolve, without their text", () => {
    saveLinkedSource(UID, linked("link:youtube:dQw4w9WgXcQ", { platform: "youtube" }));
    saveLinkedSource(UID, linked(`upload:${"b".repeat(40)}`, { platform: undefined }));
    expect(storage.getItem(REMIX_LINKS_PREFIX + UID)).not.toBeNull();
    expect(resolveSource("link:youtube:dQw4w9WgXcQ", UID)).toEqual({ key: "link:youtube:dQw4w9WgXcQ", kind: "link", platform: "youtube", title: "Post link:youtube:dQw4w9WgXcQ", remixedAt: "" });
    expect(resolveSource(`upload:${"b".repeat(40)}`, UID)).toMatchObject({ kind: "upload", remixedAt: "" });
    expect(resolveSource("link:x:123456789", UID)).toBeNull();
  });
});

describe("the read runner", () => {
  const settle = () => new Promise<void>((resolve) => {
    const off = onLinkRead((r) => {
      if (r?.state !== "working") {
        off();
        resolve();
      }
    });
  });

  it("reads a link through remix-link, saves it and ends done with its key", async () => {
    callFn.mockResolvedValue({ source: linked("link:instagram:C8xYz12AbCd") });
    const done = settle();
    void startLinkRead(UID, { url: "instagram.com/reel/C8xYz12AbCd/?igsh=x" });
    expect(linkRead()).toMatchObject({ state: "working", step: "Reading the post" });
    await done;
    expect(callFn).toHaveBeenCalledWith("remix-link", { mode: "link", url: "https://www.instagram.com/reel/C8xYz12AbCd/" });
    expect(linkRead()).toMatchObject({ state: "done", key: "link:instagram:C8xYz12AbCd" });
    expect(savedLinks(UID)[0].key).toBe("link:instagram:C8xYz12AbCd");
  });

  it("reopens a link already read for free", async () => {
    saveLinkedSource(UID, linked("link:instagram:C8xYz12AbCd"));
    const done = settle();
    void startLinkRead(UID, { url: "https://www.instagram.com/p/C8xYz12AbCd/" });
    await done;
    expect(callFn).not.toHaveBeenCalled();
    expect(linkRead()).toMatchObject({ state: "done", key: "link:instagram:C8xYz12AbCd" });
  });

  it("fails with the server's own words and code, and saves nothing", async () => {
    callFn.mockRejectedValue(new EdgeError("You've used all 20 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    const done = settle();
    void startLinkRead(UID, { url: "https://youtu.be/dQw4w9WgXcQ" });
    await done;
    expect(linkRead()).toMatchObject({ state: "failed", code: "daily_limit", error: "You've used all 20 for today. It resets at 8am Singapore time." });
    expect(savedLinks(UID)).toEqual([]);
  });

  it("keeps a cancelled read's answer in the saved list without opening it, and tells the page", async () => {
    let answer: (v: unknown) => void = () => {};
    callFn.mockReturnValue(new Promise((r) => (answer = r)));
    const run = startLinkRead(UID, { url: "https://youtu.be/dQw4w9WgXcQ" });
    clearLinkRead();
    const heard: unknown[] = [];
    const off = onLinkRead((r) => heard.push(r));
    answer({ source: linked("link:youtube:dQw4w9WgXcQ") });
    await run;
    off();
    expect(linkRead()).toBeNull();
    expect(heard).toEqual([null]);
    expect(savedLinks(UID).map((s) => s.key)).toEqual(["link:youtube:dQw4w9WgXcQ"]);
  });

  it("says so when the device has no room to keep the answer, instead of opening nothing", async () => {
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    callFn.mockResolvedValue({ source: linked("link:youtube:dQw4w9WgXcQ") });
    const done = settle();
    void startLinkRead(UID, { url: "https://youtu.be/dQw4w9WgXcQ" });
    await done;
    expect(linkRead()).toMatchObject({ state: "failed", code: "not_kept", error: NOT_KEPT });
  });

  it("refuses a wrong file before any call", async () => {
    const done = settle();
    void startLinkRead(UID, { file: new File(["x"], "notes.pdf", { type: "application/pdf" }) });
    await done;
    expect(linkRead()).toMatchObject({ state: "failed", error: "Upload a JPG, PNG, WebP, MP4 or MOV file." });
    expect(callFn).not.toHaveBeenCalled();
  });
});

describe("links.clone", () => {
  it("reopens a read source with source=, and keeps url= and clone= as they were", async () => {
    const { links } = await import("./links");
    expect(links.clone({ source: "link:instagram:C8xYz12AbCd" })).toBe("/clone?source=link%3Ainstagram%3AC8xYz12AbCd");
    expect(links.clone({ url: "https://youtu.be/dQw4w9WgXcQ" })).toBe("/clone?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ");
    expect(links.clone({ clone: "instagram:C8xYz12AbCd" })).toBe("/clone?clone=instagram%3AC8xYz12AbCd");
  });
});
