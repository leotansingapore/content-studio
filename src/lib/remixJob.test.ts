import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));

import { splitDraftIntoSlides } from "./carousel";
import { loadDrafts } from "./draftHistory";
import { EdgeError } from "./edgeFn";
import type { MakeResponse, MakeResult } from "./remix";
import { clearRemixJob, onRemixJob, remixJob, runParams, startRemix, type RemixJobState, type RemixRun } from "./remixJob";
import type { RemixSource } from "./remixSource";
import { splitScriptCaption } from "./scriptCaption";

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

let local: MemStorage;
beforeEach(() => {
  local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", local);
  make.mockReset();
  clearRemixJob();
});
afterEach(() => vi.unstubAllGlobals());

const source: RemixSource = { key: "ad:123", kind: "ad", format: "image", author: "Singlife", caption: "Save $12,000 a year with us.", remixedAt: "" };
const run = (as: RemixRun["as"], extra: Partial<RemixRun> = {}): RemixRun => ({ source, keep: "structure", close: "balanced", as, mention: true, offer: null, ...extra });
const answer = (result: MakeResult, flags = { copied: [], claim: false, invented: false }): MakeResponse => ({ as: result.as, result, flags, usage: { used: 1, limit: 30 } });

/** Resolves once the job stops working. */
const finished = () =>
  new Promise<RemixJobState>((resolve) => {
    const off = onRemixJob((j) => {
      if (j && j.state !== "working") {
        off();
        resolve(j);
      }
    });
  });

describe("startRemix", () => {
  it("saves exactly one draft with its source and how it was made", async () => {
    make.mockResolvedValue(answer({ as: "post", hook: "Three checks before you sign", body: "First, read it — slowly.", cta: "DM me CHECK", hashtags: ["money"] }, { copied: ["a line"], claim: true, invented: false }));
    local.setItem(`cs-remix-note-${source.key}`, "use my offer");
    const done = finished();
    startRemix(UID, run(["post"], { note: "use my offer" }));
    expect(remixJob()?.state).toBe("working");
    const j = await done;

    const drafts = loadDrafts(UID);
    expect(drafts).toHaveLength(1);
    const d = drafts[0];
    expect(d.source).toMatchObject({ key: "ad:123", kind: "ad", author: "Singlife" });
    expect(Date.parse(d.source!.remixedAt)).not.toBeNaN();
    expect(d.remix).toEqual({ keep: "structure", as: "post", close: "balanced", flags: { copied: ["a line"], claim: true, invented: false } });
    expect(d).toMatchObject({ format: "text-post", pillar: "topic", audience: "general", hook: "Three checks before you sign", ctaType: "dm-keyword" });
    expect(d.draft).toBe("Three checks before you sign\n\nFirst, read it, slowly.\n\nDM me CHECK\n\n#money");
    expect(j).toMatchObject({ state: "done", key: "ad:123" });
    expect(j.rows[0]).toMatchObject({ state: "done", draftId: d.id, href: `/generate?draft=${d.id}`, hook: d.hook });
    // the note is kept until the remix is done
    expect(local.getItem(`cs-remix-note-${source.key}`)).toBeNull();

    const sent = make.mock.calls[0][0];
    expect(sent).toMatchObject({ mode: "make", as: "post", keep: "structure", close: "balanced", note: "use my offer", source: { key: "ad:123", text: "Save $12,000 a year with us." } });
    expect(sent.brand).toMatchObject({ mention: true, offer: null });
  });

  it("saves nothing when the call fails, and says nothing was used", async () => {
    make.mockRejectedValue(new EdgeError("That remix didn't go through. Nothing was used.", 502, "failed"));
    local.setItem(`cs-remix-note-${source.key}`, "keep me");
    const done = finished();
    startRemix(UID, run(["post"]));
    const j = await done;
    expect(loadDrafts(UID)).toHaveLength(0);
    expect(j.state).toBe("failed");
    expect(j.rows[0]).toMatchObject({ state: "failed", refunded: true, error: "That remix didn't go through. Nothing was used." });
    expect(local.getItem(`cs-remix-note-${source.key}`)).toBe("keep me");
  });

  it("names the cap, and never claims a lost connection used nothing", async () => {
    make.mockRejectedValueOnce(new EdgeError("You've used all 30 for today.", 429, "daily_limit"));
    let done = finished();
    startRemix(UID, run(["post"]));
    expect((await done).rows[0].error).toBe("No remixes left today. They reset at 8am Singapore time.");
    make.mockRejectedValueOnce(new EdgeError("Couldn't reach the server.", 0));
    done = finished();
    startRemix(UID, run(["post"]));
    expect((await done).rows[0]).toMatchObject({ error: "That remix didn't go through.", refunded: false });
  });

  it("ignores a second start while one is running", async () => {
    let release!: (v: MakeResponse) => void;
    make.mockReturnValue(new Promise((r) => (release = r)));
    const done = finished();
    startRemix(UID, run(["post"]));
    const first = remixJob()!.id;
    startRemix(UID, run(["carousel"], { source: { ...source, key: "ad:other" } }));
    expect(remixJob()).toMatchObject({ id: first, key: "ad:123" });
    release(answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }));
    await done;
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("caps a carousel at 7 points when the splitter won't read its CTA as one, so nothing is dropped", async () => {
    const slides = Array.from({ length: 8 }, (_, i) => ({ title: `Point ${i + 1} on CPF`, body: `Why point ${i + 1} matters.` }));
    make.mockResolvedValue(answer({ as: "carousel", hook: "Eight CPF checks", slides, cta: "Have a great week ahead" }));
    const done = finished();
    startRemix(UID, run(["carousel"]));
    const j = await done;
    const d = loadDrafts(UID)[0];
    expect(j.rows[0].href).toBe(`/carousel?draft=${d.id}`);
    const split = splitDraftIntoSlides(d.draft, { hook: d.hook });
    expect(split.dropped).toBe(0);
    expect(split.slides.map((s) => s.title).join(" ")).toContain("Point 7");
    expect(split.slides.map((s) => s.title).join(" ")).not.toContain("Point 8");
    expect(split.slides.map((s) => `${s.title} ${s.body}`).join(" ")).toContain("Have a great week ahead");
  });

  it("keeps all 8 points when the CTA reads as one", async () => {
    const slides = Array.from({ length: 8 }, (_, i) => ({ title: `Point ${i + 1} on CPF`, body: `Why point ${i + 1} matters.` }));
    make.mockResolvedValue(answer({ as: "carousel", hook: "Eight CPF checks", slides, cta: "Save this for your next review" }));
    const done = finished();
    startRemix(UID, run(["carousel"]));
    await done;
    const split = splitDraftIntoSlides(loadDrafts(UID)[0].draft, { hook: "Eight CPF checks" });
    expect(split.slides).toHaveLength(10);
    expect(split.ctaFromDraft).toBe(true);
  });

  it("writes a script the way Clone a reel does, with a shot list that matches it", async () => {
    const beat = (say: string) => ({ say, onScreen: "On screen", visual: "Me to camera", seconds: 5, delivery: "Pause" });
    make.mockResolvedValue(answer({ as: "script", hook: "Stop checking CPF once a year", beats: [beat("Stop checking CPF once a year"), beat("Here's why — it moves."), beat("Check it monthly"), beat("Comment CPF for my list")], caption: "Your CPF moves. Comment CPF.", cta: "Comment CPF" }));
    const done = finished();
    startRemix(UID, run(["script"], { source: { ...source, format: "video", key: "top:a-b", kind: "top-post" } }));
    await done;
    const d = loadDrafts(UID)[0];
    expect(d.format).toBe("short-video");
    expect(d.draft).toBe("Stop checking CPF once a year\nHere's why, it moves.\nCheck it monthly\nComment CPF for my list\n\n---\n\nCAPTION:\nYour CPF moves. Comment CPF.");
    expect(d.storyboard!.script).toBe((splitScriptCaption(d.draft).script ?? "").trim());
    expect(d.storyboard!.beats).toHaveLength(4);
    expect(d.ctaType).toBe("comment-keyword");
  });

  it("holds the brand kit's emoji rule", async () => {
    local.setItem(`content-studio-carousel-brand-${UID}`, JSON.stringify({ color: "#000", name: "Leo", handle: "", emojiPolicy: "none" }));
    make.mockResolvedValue(answer({ as: "post", hook: "Big news 🎉", body: "Read this 👇", cta: "DM me", hashtags: [] }));
    const done = finished();
    startRemix(UID, run(["post"], { mention: false }));
    await done;
    expect(loadDrafts(UID)[0].draft).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(make.mock.calls[0][0].brand).toMatchObject({ name: "Leo", mention: false });
  });
});

describe("runParams", () => {
  it("keeps the run's choices on the job, and the sheet link carries them with the defaults left out", async () => {
    let release!: (v: MakeResponse) => void;
    make.mockReturnValue(new Promise((r) => (release = r)));
    const done = finished();
    startRemix(UID, run(["post"], { keep: "topic", about: "Insurance basics", close: "close", mention: true, offer: "Free money check" }));
    const j = remixJob()!;
    expect(j.run).toEqual({ keep: "topic", about: "Insurance basics", close: "close", mention: true, offer: "Free money check" });
    expect(runParams(j.key, j.run)).toEqual({ remix: "ad:123", keep: "topic", about: "insurance-basics", close: "close", mention: null, offer: "free-money-check" });
    release(answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }));
    await done;
    expect(runParams("ad:1", { keep: "structure", close: "balanced", mention: true, offer: null })).toEqual({ remix: "ad:1", keep: null, about: null, close: null, mention: null, offer: null });
    expect(runParams("ad:1", { keep: "hook", about: "CPF", close: "loose", mention: false, offer: "Free money check" })).toEqual({ remix: "ad:1", keep: "hook", about: null, close: "loose", mention: "no", offer: null });
  });
});
