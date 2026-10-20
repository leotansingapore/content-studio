import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { basedOnFor, type Teardown } from "../../supabase/functions/remix/teardown.ts";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const b = await import("./boards");
const t = await import("./postTags");
type BoardItem = import("./boards").BoardItem;

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", () => true);
  callFn.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const KEY = "content-studio-boards-u1";
const items = () => (JSON.parse(storage.getItem(KEY)!) as { items: BoardItem[] }).items;
const settle = () => new Promise((r) => setTimeout(r, 0));
const item = (extra: Partial<BoardItem> = {}): BoardItem => ({
  key: "top:mrbrown-ABC", kind: "top-post", url: "https://www.instagram.com/p/ABC/", platform: "instagram", format: "carousel", title: "",
  caption: "Everyone says clear your home loan early.", author: "@mrbrown", cover: "", numbers: {}, postedAt: "", savedAt: "", boards: [], note: "", read: "done", ...extra,
});
const teardown = (over: Partial<Teardown> = {}): Teardown => ({
  v: 1, key: "link:tiktok:7412345678901234567", format: "video",
  hook: { line: "Everyone says clear your home loan early, but after nine years of reading CPF statements I am really not so sure about that", pattern: "", formula: "myth-bust" },
  beats: ["Opens on a common belief, said to camera", "Shows one number that breaks it", "Explains why in two steps", "Ends asking viewers to comment their age"],
  payoff: "p", cta: "None", pacing: null, whyItWorked: "w", dontReuse: [], basedOn: "transcript", at: "2026-10-20T03:14:00.000Z",
  tags: { formula: "myth-bust", angle: "Contrarian", topic: "CPF", emotion: "worry", audience: "young-adults", p: { formula: 0.71, angle: 0.64, topic: 0.88, emotion: 0.52, audience: 0.42 }, by: "jev" },
  ...over,
});

describe("the lists", () => {
  it("gives every formula, angle, topic, feeling and audience a label, once", () => {
    for (const f of t.TAG_FILTERS) {
      expect(f.options.length, f.param).toBeGreaterThan(0);
      expect(new Set(f.options.map((o) => o.value)).size, f.param).toBe(f.options.length);
      for (const o of f.options) expect(o.label.trim(), `${f.param} ${o.value}`).not.toBe("");
    }
    const by = (p: string) => t.TAG_FILTERS.find((f) => f.param === p)!.options;
    expect(by("hook").map((o) => o.value)).toEqual(HOOK_FORMULAS.map((f) => f.id));
    expect(by("angle")).toHaveLength(8);
    expect(by("topic")).toContainEqual({ value: "career-fa-life", label: "Career / FA Life" });
    expect(by("emotion").map((o) => o.label)).toEqual(["Worry", "Hope", "Relief", "Pride", "Curiosity", "Urgency", "Trust", "Fun"]);
    expect(by("audience").map((o) => o.label)).toEqual(["Fresh grads", "Young adults", "Parents", "Families", "High net worth", "Business owners", "Advisers and recruits", "General"]);
    expect(by("format").map((o) => o.value)).toEqual(["reel", "carousel", "picture", "video", "text", "link"]);
  });
});

describe("tagsFromTeardown", () => {
  const tiktok = item({ key: "link:tiktok:7412345678901234567", kind: "link", platform: "tiktok", format: "video", url: "https://www.tiktok.com/@a/video/7412345678901234567" });

  it("copies the tags, the beats and what the read knows, and keeps unsure ones out of the chips", () => {
    const tags = t.tagsFromTeardown(teardown(), tiktok, "one two three four", 42.4);
    expect(tags).toMatchObject({
      formula: "myth-bust", angle: "Contrarian", topic: "CPF", emotion: "worry", audience: "young-adults", by: "jev",
      p: { formula: 0.71, angle: 0.64, topic: 0.88, emotion: 0.52, audience: 0.42 },
      format: "reel", seconds: 42, slides: null, words: 4, at: "2026-10-20T03:14:00.000Z",
      beats: teardown().beats,
    });
    expect(tags.opening.length).toBeLessThanOrEqual(100);
    expect(tags.opening).toMatch(/^Everyone says clear your home loan early.*\.\.\.$/);
    const saved = { tags };
    expect(t.chipsFor(saved)).toEqual(["Myth bust", "Contrarian", "Worry"]);
    // audience at 0.42 is unsure: no label, no filter value
    expect(t.tagLabel(saved, "audience")).toBeNull();
    expect(t.tagLabel(saved, "topic")).toBe("CPF");
    expect(t.formatLine(tags)).toBe("Reel, 42 s");
  });

  it("leaves an unsure formula and feeling off the card", () => {
    const tags = t.tagsFromTeardown(teardown({ tags: { ...teardown().tags!, p: { formula: 0.55, angle: 0.64, emotion: 0.3 } } }), item(), "", null);
    expect(t.chipsFor({ tags })).toEqual(["Contrarian"]);
    expect(t.hookRow(tags)).toEqual({ name: null, line: tags.opening });
  });

  it("says no speech for a read video with no transcript and a picture, and nothing for an in-app reel it never read", () => {
    expect(t.tagsFromTeardown(teardown(), { ...tiktok, read: "done" }, "", 30).words).toBe(0);
    expect(t.tagsFromTeardown(teardown(), item({ format: "image" }), "", null)).toMatchObject({ words: 0, format: "picture" });
    expect(t.tagsFromTeardown(teardown(), item({ format: "video" }), "", null)).toMatchObject({ words: null, format: "reel" });
  });

  it("writes each format line from the read, never a model", () => {
    expect(t.formatLine({ format: "video", seconds: 185, slides: null })).toBe("Video, 3 min");
    expect(t.formatLine({ format: "carousel", seconds: null, slides: 8 })).toBe("Carousel, 8 slides");
    expect(t.formatLine({ format: "carousel", seconds: null, slides: null })).toBe("Carousel");
    expect(t.formatOf({ format: "video", kind: "link", platform: "youtube", url: "https://www.youtube.com/watch?v=x" }, null)).toBe("video");
    expect(t.formatOf({ format: "video", kind: "link", platform: "youtube", url: "https://www.youtube.com/shorts/x" }, 40)).toBe("reel");
    expect(t.formatOf({ kind: "link", platform: "web", url: "https://example.com" }, null)).toBe("link");
  });

  it("survives the synced key's clean-up and drops what isn't a tag", () => {
    const tags = t.tagsFromTeardown(teardown(), tiktok, "a b", 42);
    expect(t.cleanTags(JSON.parse(JSON.stringify(tags)))).toEqual(tags);
    expect(t.cleanTags({ ...tags, format: "hologram", p: { formula: "high" }, beats: [1, "ok"], by: "gpt" })).toMatchObject({ format: "text", p: {}, beats: ["ok"], by: "jev" });
    expect(t.cleanTags({ formula: "x" })).toBeUndefined();
    expect(t.cleanTags(null)).toBeUndefined();
  });
});

describe("filters", () => {
  const sure = { tags: t.tagsFromTeardown(teardown(), item(), "", null) };
  const unsureHook = { tags: t.tagsFromTeardown(teardown({ tags: { ...teardown().tags!, p: { ...teardown().tags!.p, formula: 0.5 } } }), item(), "", null) };
  const none = { tags: undefined };

  it("leaves out the items where Jev was unsure of the tag", () => {
    expect(t.filterByTags([sure, unsureHook, none], { hook: "myth-bust" })).toEqual([sure]);
    expect(t.filterByTags([sure, unsureHook, none], { angle: "contrarian", topic: "cpf" })).toEqual([sure, unsureHook]);
    expect(t.filterByTags([sure, unsureHook, none], { audience: "young-adults" })).toEqual([]);
    expect(t.filterByTags([sure, unsureHook, none], { hook: "all", format: "all" })).toHaveLength(3);
    expect(t.filterByTags([sure, none], { format: "carousel" })).toEqual([sure]);
  });

  it("counts each sure value", () => {
    const c = t.tagCounts([sure, unsureHook, none]);
    expect(c.hook).toEqual({ "myth-bust": 1 });
    expect(c.angle).toEqual({ contrarian: 2 });
    expect(c.audience).toEqual({});
  });
});

describe("tagText", () => {
  it("sends the caption and what is said, or the title and note when there is neither", () => {
    expect(t.tagText({ title: "", caption: "Clear your loan early?", note: "n" }, "So here is the thing")).toBe("Caption: Clear your loan early?\n\nSaid in the video: So here is the thing");
    expect(t.tagText({ title: "", caption: "", note: "" }, "So here is the thing")).toBe("Said in the video: So here is the thing");
    expect(t.tagText({ title: "A blog", caption: "", note: "Great list of CPF tips" })).toBe("A blog\n\nGreat list of CPF tips");
    expect(t.tagText({ title: "", caption: "", note: "" })).toBe("");
    expect(t.tagText({ title: "", caption: "c", note: "" }, "x".repeat(5000))).toHaveLength(2000);
  });
});

describe("the chain (boards.ts runTags)", () => {
  const tiktok = "https://www.tiktok.com/@mrbrown/video/7412345678901234567";
  const read = { source: { platform: "tiktok", postId: "7412345678901234567", url: tiktok, author: "mrbrown", caption: "Clear your loan early?", transcript: "Everyone says clear it early but here is why I disagree", isVideo: true, postedAt: null, durationSec: 42, metrics: null, metricsAsOf: null } };

  it("waits for the read, then sends its caption and transcript as text with no post url", async () => {
    let finishRead: (v: unknown) => void = () => {};
    let finishTags: (v: unknown) => void = () => {};
    callFn.mockReturnValueOnce(new Promise((r) => (finishRead = r))).mockReturnValueOnce(new Promise((r) => (finishTags = r)));
    const saved = await b.saveLink("u1", tiktok, "");
    const key = (saved as { item: BoardItem }).item.key;
    // the read is still running: a press now sends nothing
    await b.runTags("u1", key);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(items()[0].tagState).toBeUndefined();

    finishRead(read);
    await settle();
    expect(callFn).toHaveBeenCalledTimes(2);
    const [fn, body] = callFn.mock.calls[1] as [string, { mode: string; tags: boolean; source: Record<string, string> }];
    expect(fn).toBe("remix");
    expect(body).toMatchObject({ mode: "teardown", tags: true });
    expect(body.source).not.toHaveProperty("url");
    expect(body.source).toMatchObject({ key, kind: "link", format: "video", platform: "tiktok" });
    expect(body.source.text).toBe("Caption: Clear your loan early?\n\nSaid in the video: Everyone says clear it early but here is why I disagree");
    expect(basedOnFor(body.source as never, null)).toBe("transcript");
    expect(items()[0].tagState).toBe("pending");
    expect(b.isTagging(key)).toBe(true);

    finishTags({ teardown: teardown({ key }) });
    await settle();
    expect(items()[0]).toMatchObject({ tagState: "done", tags: { formula: "myth-bust", format: "reel", seconds: 42, words: 11 } });
    expect(b.isTagging(key)).toBe(false);
    // the transcript stays on the device; the breakdown is kept for the Remix sheet too
    expect(storage.getItem(KEY)).not.toContain("here is why I disagree");
    expect(storage.getItem("content-studio-remix-teardowns-u1")).toContain('"tags"');
  });

  it("breaks an in-app item down at save from its own text, with no read", async () => {
    callFn.mockResolvedValueOnce({ teardown: teardown({ key: "top:mrbrown-ABC" }) });
    const r = b.addItem("u1", item());
    expect(r.ok).toBe(true);
    await settle();
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(callFn.mock.calls[0][0]).toBe("remix");
    expect((callFn.mock.calls[0][1] as { source: { text: string } }).source.text).toBe("Everyone says clear your home loan early.");
    expect(items()[0]).toMatchObject({ tagState: "done", tags: { format: "carousel", words: 0 } });
  });

  it("marks a link with nothing to read as none, and breaks it down from the note on a press", async () => {
    const web = (await b.saveLink("u1", "https://example.com/cpf-tips", "")) as { item: BoardItem };
    expect(items()[0].tagState).toBe("none");
    expect(callFn).not.toHaveBeenCalled();
    b.setNote("u1", web.item.key, "Five CPF tips worth a carousel");
    callFn.mockResolvedValueOnce({ teardown: teardown({ key: web.item.key }) });
    await b.runTags("u1", web.item.key);
    expect((callFn.mock.calls[0][1] as { source: { text: string } }).source.text).toBe("Five CPF tips worth a carousel");
    expect(items()[0]).toMatchObject({ tagState: "done", tags: { format: "link" } });
  });

  it("shows the cap on a 429 and failed on anything else, keeping the item", async () => {
    callFn.mockRejectedValueOnce(new EdgeError("You've used all 60 for today.", 429, "daily_limit"));
    b.addItem("u1", item());
    await settle();
    expect(items()[0]).toMatchObject({ key: "top:mrbrown-ABC", tagState: "capped" });
    callFn.mockRejectedValueOnce(new EdgeError("Couldn't break this one down.", 502, "failed"));
    await b.runTags("u1", "top:mrbrown-ABC");
    expect(items()[0].tagState).toBe("failed");
    expect(items()[0].tags).toBeUndefined();
  });

  it("reuses a stored tagged breakdown, and Break it down again asks anew", async () => {
    callFn.mockResolvedValueOnce({ teardown: teardown({ key: "top:mrbrown-ABC" }) });
    b.addItem("u1", item());
    await settle();
    await b.runTags("u1", "top:mrbrown-ABC");
    expect(callFn).toHaveBeenCalledTimes(1);
    callFn.mockResolvedValueOnce({ teardown: teardown({ key: "top:mrbrown-ABC", at: "2026-10-21T00:00:00.000Z" }) });
    await b.runTags("u1", "top:mrbrown-ABC", true);
    expect(callFn).toHaveBeenCalledTimes(2);
    expect(items()[0].tags?.at).toBe("2026-10-21T00:00:00.000Z");
  });

  it("shows a dead pending breakdown as failed", () => {
    const old = item({ tagState: "pending", savedAt: "2026-10-20T00:00:00Z" });
    expect(b.tagShown(old, Date.parse("2026-10-20T00:02:00Z"))).toBe("pending");
    expect(b.tagShown(old, Date.parse("2026-10-20T00:04:00Z"))).toBe("failed");
  });
});

describe("Remix with this hook", () => {
  it("opens Write with the formula picked", () => {
    const url = new URL(b.writeUrlFor(item(), { formula: "myth-bust" }), "https://x");
    expect(url.pathname).toBe("/generate");
    expect(url.searchParams.get("formula")).toBe("myth-bust");
    expect(url.searchParams.get("source")).toBe("top:mrbrown-ABC");
    // Remix itself is unchanged: no formula
    expect(b.remixUrlFor(item())).not.toContain("formula");
  });
});
