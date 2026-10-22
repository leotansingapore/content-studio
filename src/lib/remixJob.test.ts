import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
const tear = vi.hoisted(() => ({ local: vi.fn(), ensure: vi.fn() }));
vi.mock("@/lib/remixTeardown", () => ({ localTeardown: tear.local, ensureTeardown: tear.ensure }));
// aiVideo's jobs never throw: they set the job's state, which the remix row reads after each await
const ai = vi.hoisted(() => ({
  job: null as null | { kind: string; state: string; step: string; url?: string; error?: string },
  busy: false,
  calls: [] as string[],
  presenter: vi.fn(),
  avatar: vi.fn(),
  explainer: vi.fn(),
  slice: vi.fn(),
  speak: vi.fn(),
}));
vi.mock("@/lib/aiVideo", async (orig) => ({
  ...(await orig<typeof import("./aiVideo")>()),
  LOOKS: ["A Chinese Singaporean woman in her early 30s"],
  aiJob: () => ai.job,
  aiBusy: () => ai.busy,
  onAiJob: () => () => {},
  makePresenter: ai.presenter,
  makeAvatar: ai.avatar,
  makeExplainer: ai.explainer,
  sliceVoiceover: ai.slice,
}));
vi.mock("@/lib/textVoice", async (orig) => ({ ...(await orig<typeof import("./textVoice")>()), speak: ai.speak }));

import { splitDraftIntoSlides } from "./carousel";
import { loadDrafts } from "./draftHistory";
import { EdgeError } from "./edgeFn";
import { VIDEO_LIMITS, type MakeResponse, type MakeResult } from "./remix";
import {
  BREAKING,
  CHECKING,
  NOT_THROUGH,
  NOTHING_USED,
  READING,
  VOICEOVER,
  clearRemixJob,
  onRemixJob,
  remixJob,
  runParams,
  startRemix,
  writingStep,
  type RemixJobState,
  type RemixRun,
} from "./remixJob";
import type { Teardown } from "./remixTeardown";
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
  tear.local.mockReset().mockReturnValue(TEARDOWN);
  tear.ensure.mockReset();
  Object.assign(ai, { job: null, busy: false, calls: [] });
  for (const f of [ai.presenter, ai.avatar, ai.explainer, ai.slice, ai.speak]) f.mockReset();
  clearRemixJob();
});
afterEach(() => vi.unstubAllGlobals());

const TEARDOWN: Teardown = {
  v: 1,
  key: "ad:123",
  format: "image",
  hook: { line: "Save $12,000 a year with us.", pattern: "Save [amount] a [period] with [brand].", formula: null },
  beats: ["Names the saving", "Says how", "Asks you to sign up"],
  payoff: "A saving",
  cta: "Sign up",
  pacing: null,
  whyItWorked: "A number.",
  dontReuse: ["$12,000", "Singlife"],
  basedOn: "ad",
  at: new Date().toISOString(),
};
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
    local.setItem(`content-studio-carousel-brand-${UID}`, JSON.stringify({ color: "#000", name: "Leo", handle: "" }));
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
    expect(j.rows[0]).toMatchObject({ state: "failed", refunded: true, error: NOTHING_USED });
    expect(NOTHING_USED).toBe("This one didn't go through. Nothing was used for it.");
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
    expect((await done).rows[0]).toMatchObject({ error: NOT_THROUGH, refunded: false });
    expect(NOT_THROUGH).toBe("This one didn't go through.");
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

  it("walks Reading the post, Writing your <format>, Checking it, with the call sent at once", async () => {
    vi.useFakeTimers();
    let release!: (v: MakeResponse) => void;
    make.mockReturnValue(new Promise((r) => (release = r)));
    const done = finished();
    try {
      startRemix(UID, run(["carousel"]));
      expect(remixJob()!.step).toBe(READING);
      expect(make).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(600);
      expect(remixJob()!.step).toBe(writingStep("carousel"));
      vi.advanceTimersByTime(12_000);
      expect(remixJob()!.step).toBe(CHECKING);
    } finally {
      // finish the run either way, so a failure here never leaves a job running into the next test
      release(answer({ as: "carousel", hook: "H", slides: Array.from({ length: 4 }, (_, i) => ({ title: `T${i}`, body: "B" })), cta: "Save this" }));
      await done;
      vi.useRealTimers();
    }
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

// phase 6's remix-topic pin, taken before a run could start from a topic: a source run's bodies and drafts, byte for byte
describe("a source run, as it was before topic runs", () => {
  it("sends the same make bodies and saves the same drafts for a post, a carousel and a script", async () => {
    const beat = (say: string) => ({ say, onScreen: "On screen", visual: "Me to camera", seconds: 5, delivery: "Pause" });
    const results: Record<string, MakeResult> = {
      post: { as: "post", hook: "Three checks before you sign", body: "First, read it slowly.", cta: "DM me CHECK", hashtags: ["money"] },
      carousel: { as: "carousel", hook: "Four CPF checks", slides: Array.from({ length: 4 }, (_, i) => ({ title: `Check ${i + 1}`, body: `Why check ${i + 1} matters.` })), cta: "Save this for your next review" },
      script: { as: "script", hook: "Stop checking CPF once a year", beats: [beat("Stop checking CPF once a year"), beat("Here's why it moves."), beat("Check it monthly"), beat("Comment CPF for my list")], caption: "Your CPF moves. Comment CPF.", cta: "Comment CPF" },
    };
    make.mockImplementation(async (b: { as: string }) => answer(results[b.as], { copied: [], claim: b.as === "post", invented: false }));
    local.setItem(`content-studio-carousel-brand-${UID}`, JSON.stringify({ color: "#000", name: "Leo", handle: "" }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T04:00:00.000Z"));
    try {
      const done = finished();
      startRemix(UID, run(["post", "carousel", "script"], { note: "use my offer", fit: { verdict: "good", reasons: [] } }));
      await done;
    } finally {
      vi.useRealTimers();
    }
    // written in the order the job builds them, so the JSON compares byte for byte
    const at = "2026-10-22T04:00:00.000Z";
    const brand = (rules = "") => ({ name: "Leo", oneLiner: "", audience: "", topics: [], facts: "", mention: true, offer: null, rules, speaker: "person" });
    const sent = (as: string, rules?: string) => ({
      mode: "make",
      as,
      source: { key: "ad:123", kind: "ad", format: "image", author: "Singlife", text: "Save $12,000 a year with us." },
      keep: "structure",
      close: "balanced",
      note: "use my offer",
      voice: null,
      brand: brand(rules),
      teardown: { hookPattern: "Save [amount] a [period] with [brand].", beats: TEARDOWN.beats, dontReuse: ["$12,000", "Singlife"] },
      fit: { verdict: "good", reasons: [] },
    });
    expect(JSON.stringify(make.mock.calls.map(([b]) => b))).toBe(
      JSON.stringify([sent("post"), sent("carousel"), sent("script", "MY BRAND RULES (these win over any other emoji, hashtag or link guidance): Use 5 hashtags at most.")]),
    );
    const base = (as: string, platform: string, claim = false) => ({
      id: "ID",
      createdAt: at,
      pillar: "topic",
      audience: "general",
      platform,
      source: { ...source, remixedAt: at },
      remix: { keep: "structure", as, close: "balanced", fit: "good", flags: { copied: [], claim, invented: false } },
    });
    const script = results.script as Extract<MakeResult, { as: "script" }>;
    const spoken = script.beats.map((b) => b.say).join("\n");
    expect(JSON.stringify(loadDrafts(UID).map((d) => ({ ...d, id: "ID" })))).toBe(
      JSON.stringify([
        {
          ...base("script", "instagram"),
          hook: script.hook,
          draft: `${spoken}\n\n---\n\nCAPTION:\n${script.caption}`,
          pillarDetail: script.hook,
          format: "short-video",
          ctaType: "comment-keyword",
          storyboard: { beats: script.beats, script: spoken, madeAt: at },
        },
        {
          ...base("carousel", "linkedin"),
          hook: "Four CPF checks",
          draft: "Slide 1: Four CPF checks\n\nSlide 2: Check 1\nWhy check 1 matters.\n\nSlide 3: Check 2\nWhy check 2 matters.\n\nSlide 4: Check 3\nWhy check 3 matters.\n\nSlide 5: Check 4\nWhy check 4 matters.\n\nSlide 6: Save this for your next review",
          pillarDetail: "Four CPF checks",
          format: "carousel",
          ctaType: "save-share",
        },
        {
          ...base("post", "linkedin", true),
          hook: "Three checks before you sign",
          draft: "Three checks before you sign\n\nFirst, read it slowly.\n\nDM me CHECK\n\n#money",
          pillarDetail: "Three checks before you sign",
          format: "text-post",
          ctaType: "dm-keyword",
        },
      ]),
    );
  });
});

describe("a run from a typed topic (the agent's)", () => {
  const agent = { thread: "t1a2b", msg: "m3c4d" };
  const beat = (say: string) => ({ say, onScreen: "", visual: "Me to camera", seconds: 5, delivery: "Pause" });
  const results: Record<string, MakeResult> = {
    post: { as: "post", hook: "Why I log every call", body: "It shows me the week.", cta: "Comment LOG.", hashtags: [] },
    carousel: { as: "carousel", hook: "Log every call", slides: Array.from({ length: 4 }, (_, i) => ({ title: `Reason ${i + 1}`, body: "It adds up." })), cta: "Save this for Monday" },
    script: { as: "script", hook: "I log every call", beats: [beat("I log every call"), beat("Here's why."), beat("It shows the gaps."), beat("Comment LOG for mine.")], caption: "Log it. Comment LOG.", cta: "Comment LOG" },
  };
  const topicRun = (extra: Partial<RemixRun> = {}): RemixRun => ({ source: null, topic: "  Why I log every client call ", keep: "structure", close: "balanced", as: ["post", "carousel", "script"], mention: true, offer: null, agent, ...extra });

  it("sends the topic with no source and no breakdown, and saves one draft per format with no source and the agent's chat", async () => {
    make.mockImplementation(async (b: { as: string }) => answer(results[b.as]));
    const done = finished();
    startRemix(UID, topicRun());
    // nothing to read: the walk starts on the writing, and there is no sheet to reopen
    expect(remixJob()).toMatchObject({ key: "", step: writingStep("post"), run: { as: undefined } });
    expect(runParams(remixJob()!.key, remixJob()!.run)).toMatchObject({ remix: "", as: null });
    const j = await done;

    expect(tear.local).not.toHaveBeenCalled();
    expect(tear.ensure).not.toHaveBeenCalled();
    expect(make.mock.calls.map(([b]) => b.as)).toEqual(["post", "carousel", "script"]);
    for (const [b] of make.mock.calls) {
      expect(b).toMatchObject({ mode: "make", topic: "Why I log every client call" });
      expect("source" in b).toBe(false);
      expect("agent" in b).toBe(false);
    }
    const drafts = loadDrafts(UID);
    expect(drafts.map((d) => d.format)).toEqual(["short-video", "carousel", "text-post"]);
    for (const d of drafts) {
      expect("source" in d).toBe(false);
      expect(d.agent).toEqual(agent);
      expect(d.remix).toMatchObject({ keep: "structure", close: "balanced" });
    }
    expect(j.state).toBe("done");
    expect(j.rows.map((r) => r.href)).toEqual([`/generate?draft=${drafts[2].id}`, `/carousel?draft=${drafts[1].id}`, `/generate?draft=${drafts[0].id}`]);
  });

  it("stamps the agent's chat on a source run's draft too, and leaves the source run's body as it was", async () => {
    make.mockResolvedValue(answer(results.post));
    const done = finished();
    startRemix(UID, run(["post"], { agent: { ...agent, extra: "dropped" } as RemixRun["agent"] }));
    await done;
    const d = loadDrafts(UID)[0];
    expect(d.source).toMatchObject({ key: "ad:123" });
    expect(d.agent).toEqual(agent);
    expect("agent" in make.mock.calls[0][0]).toBe(false);
    expect(make.mock.calls[0][0].source).toMatchObject({ key: "ad:123" });
  });

  it("passes the server's no-topic refusal on, with nothing used", async () => {
    make.mockRejectedValue(new EdgeError("Type a topic or pick a post to remix.", 400, "bad_request"));
    const done = finished();
    startRemix(UID, topicRun({ topic: " ", as: ["post"] }));
    const j = await done;
    expect(make.mock.calls[0][0].topic).toBe("");
    expect(j.rows[0]).toMatchObject({ state: "failed", error: "Type a topic or pick a post to remix.", refunded: true });
    expect(loadDrafts(UID)).toHaveLength(0);
  });
});

describe("the breakdown before the first row", () => {
  it("breaks the source down once when this device has none, and sends it to every make", async () => {
    vi.useFakeTimers();
    tear.local.mockReturnValue(null);
    let release!: (t: Teardown) => void;
    tear.ensure.mockReturnValue(new Promise((r) => (release = r)));
    let first!: (v: MakeResponse) => void;
    make.mockReturnValueOnce(new Promise((r) => (first = r)));
    make.mockResolvedValue(answer({ as: "carousel", hook: "H", slides: Array.from({ length: 4 }, () => ({ title: "T", body: "B" })), cta: "Save this" }));
    const done = finished();
    try {
      startRemix(UID, run(["post", "carousel"]));
      expect(remixJob()!.step).toBe(READING);
      vi.advanceTimersByTime(600);
      expect(remixJob()!.step).toBe(BREAKING);
      expect(make).not.toHaveBeenCalled();
      expect(tear.ensure).toHaveBeenCalledWith(UID, expect.objectContaining({ key: "ad:123" }), "Save $12,000 a year with us.");
      release(TEARDOWN);
      await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(1));
      // straight to writing: the read and the breakdown are already done
      expect(remixJob()!.step).toBe(writingStep("post"));
    } finally {
      vi.useRealTimers();
      first(answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }));
    }
    await done;
    expect(tear.ensure).toHaveBeenCalledTimes(1);
    for (const [body] of make.mock.calls) {
      expect(body.teardown).toEqual({ hookPattern: "Save [amount] a [period] with [brand].", beats: TEARDOWN.beats, dontReuse: ["$12,000", "Singlife"] });
    }
  });

  it("goes on without one when the breakdown fails or is over its cap", async () => {
    tear.local.mockReturnValue(null);
    tear.ensure.mockRejectedValue(new EdgeError("You've used all 40 for today.", 429, "daily_limit"));
    make.mockResolvedValue(answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }));
    const done = finished();
    startRemix(UID, run(["post"]));
    expect((await done).state).toBe("done");
    expect(make.mock.calls[0][0].teardown).toBeUndefined();
  });

  it("makes no breakdown call when one is on this device", async () => {
    make.mockResolvedValue(answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }));
    const done = finished();
    startRemix(UID, run(["post"]));
    await done;
    expect(tear.ensure).not.toHaveBeenCalled();
  });
});

describe("several formats and the videos", () => {
  const spoken = "Most people check CPF once a year. Here is a better habit. DM me CHECK.";
  const speaking = answer({ as: "speaking", script: spoken, caption: "A better CPF habit. DM me CHECK." });
  const vo = { pcm: new Float32Array(0), seconds: 24, slices: [{ start: 0, end: 9.4 }, { start: 9.4, end: 18.8 }, { start: 18.8, end: 24 }] };
  const post = answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] });

  beforeEach(() => {
    ai.speak.mockImplementation(async () => {
      ai.calls.push(`speak:${loadDrafts(UID).length}`);
      return new Blob(["mp3"]);
    });
    ai.slice.mockResolvedValue(vo);
    ai.presenter.mockImplementation(async () => {
      ai.calls.push("presenter");
      ai.job = { kind: "presenter", state: "done", step: "", url: "https://cdn.higgsfield.ai/face.jpg" };
    });
    ai.avatar.mockImplementation(async (_name: string, photo: string) => {
      ai.calls.push(`avatar:${photo}`);
      ai.job = { kind: "avatar", state: "done", step: "" };
    });
    ai.explainer.mockImplementation(async () => {
      ai.job = { kind: "explainer", state: "done", step: "" };
    });
  });

  it("runs one make per format, text first, and a failed one never stops the others", async () => {
    make.mockImplementation(async (b: { as: string }) => {
      if (b.as === "carousel") throw new EdgeError("failed", 502, "failed");
      return b.as === "speaking" ? speaking : post;
    });
    local.setItem(`cs-remix-note-${source.key}`, "short please");
    const done = finished();
    startRemix(UID, run(["speaking", "carousel", "post"], { note: "short please" }));
    expect(remixJob()!.rows.map((r) => r.as)).toEqual(["carousel", "post", "speaking"]);
    const j = await done;
    expect(make.mock.calls.map(([b]) => b.as)).toEqual(["carousel", "post", "speaking"]);
    expect(j.state).toBe("done");
    expect(j.rows.map((r) => r.state)).toEqual(["failed", "done", "done"]);
    expect(j.rows[0]).toMatchObject({ error: NOTHING_USED, refunded: true });
    // the failed carousel's Try again gets the same note the others used
    expect(local.getItem(`cs-remix-note-${source.key}`)).toBe("short please");
  });

  it("saves the script before the voiceover and the video, then makes an AI presenter speak it", async () => {
    make.mockResolvedValue(speaking);
    const done = finished();
    startRemix(UID, run(["speaking"], { voice: "george" }));
    const j = await done;
    const d = loadDrafts(UID)[0];
    expect(ai.calls).toEqual(["speak:1", "presenter", "avatar:https://cdn.higgsfield.ai/face.jpg"]);
    expect(ai.speak).toHaveBeenCalledWith(spoken, "george");
    expect(d).toMatchObject({ format: "short-video", hook: "Most people check CPF once a year.", ctaType: "dm-keyword" });
    expect(d.storyboard).toBeUndefined();
    expect(splitScriptCaption(d.draft).script).toBe(spoken);
    expect(d.remix).toMatchObject({ as: "speaking" });
    // 9.4 s and 9.4 s are 10 s Speak slices (22 credits each), 5.2 s is one more
    expect(j.rows[0]).toMatchObject({ state: "done", href: "/edit?panel=ai&kind=avatar", draftId: d.id, scriptHref: `/generate?draft=${d.id}`, credits: 66 });
  });

  it("keeps the script and fails the row when the voiceover fails, with nothing else paid for", async () => {
    make.mockResolvedValue(speaking);
    ai.speak.mockRejectedValue(new Error("ElevenLabs is down"));
    const done = finished();
    startRemix(UID, run(["speaking"]));
    const j = await done;
    expect(loadDrafts(UID)).toHaveLength(1);
    expect(ai.presenter).not.toHaveBeenCalled();
    expect(ai.avatar).not.toHaveBeenCalled();
    expect(j).toMatchObject({ state: "failed" });
    expect(j.rows[0]).toMatchObject({ state: "failed", error: NOT_THROUGH, refunded: false, scriptHref: `/generate?draft=${loadDrafts(UID)[0].id}` });
  });

  it("stops before any video when the voiceover runs over 30.5 s", async () => {
    make.mockResolvedValue(speaking);
    ai.slice.mockResolvedValue({ ...vo, seconds: 31.2 });
    const done = finished();
    startRemix(UID, run(["speaking"]));
    const j = await done;
    expect(ai.presenter).not.toHaveBeenCalled();
    expect(j.rows[0]).toMatchObject({ state: "failed", tooLong: true, error: "The script runs 31 s, over the 30-second limit. Shorten it, then try again." });
    expect(loadDrafts(UID)).toHaveLength(1);
  });

  it("waits for a retry when another video is being made, and fails a presenter that didn't come back", async () => {
    make.mockResolvedValue(speaking);
    ai.busy = true;
    let done = finished();
    startRemix(UID, run(["speaking"]));
    expect((await done).rows[0]).toMatchObject({ state: "failed", error: "Another video is being made. Try again when it's done." });
    expect(ai.speak).not.toHaveBeenCalled();

    ai.busy = false;
    ai.presenter.mockImplementation(async () => {
      ai.job = { kind: "presenter", state: "failed", step: "", error: "Couldn't make the presenter." };
    });
    done = finished();
    startRemix(UID, run(["speaking"]));
    expect((await done).rows[0]).toMatchObject({ state: "failed", error: NOT_THROUGH });
    expect(ai.avatar).not.toHaveBeenCalled();
  });

  it("never writes over a paid avatar that is still waiting, and points a failed one to the editor", async () => {
    const PENDING = "cs-ai-video-pending";
    const waiting = JSON.stringify({ name: "Earlier", tokens: ["t1"], seconds: [9.4] });
    make.mockResolvedValue(speaking);
    local.setItem(PENDING, waiting);
    let done = finished();
    startRemix(UID, run(["speaking"]));
    expect((await done).rows[0]).toMatchObject({ state: "failed", waiting: true, error: VIDEO_LIMITS.waiting, scriptHref: expect.any(String) });
    expect(ai.speak).not.toHaveBeenCalled();
    expect(local.getItem(PENDING)).toBe(waiting);

    // this run's avatar was paid for, then didn't download: aiVideo keeps its tokens for a free finish
    local.removeItem(PENDING);
    ai.avatar.mockImplementation(async () => {
      local.setItem(PENDING, waiting);
      ai.job = { kind: "avatar", state: "failed", step: "", error: "It was made but didn't download. Try again." };
    });
    done = finished();
    startRemix(UID, run(["speaking"]));
    expect((await done).rows[0]).toMatchObject({ state: "failed", waiting: true, error: VIDEO_LIMITS.waiting });

    // Higgsfield failed it, so nothing waits and the row offers Try again
    local.removeItem(PENDING);
    ai.avatar.mockImplementation(async () => {
      local.removeItem(PENDING);
      ai.job = { kind: "avatar", state: "failed", step: "", error: "Higgsfield failed." };
    });
    done = finished();
    startRemix(UID, run(["speaking"]));
    const row = (await done).rows[0];
    expect(row).toMatchObject({ state: "failed", error: NOT_THROUGH });
    expect(row.waiting).toBeUndefined();
  });

  it("hands an explainer's scenes and voice to the explainer job, and saves its lines first", async () => {
    const scenes = [
      { say: "Your CPF moves every month.", picture: "A Malay Singaporean man reading a letter at home" },
      { say: "Check it once a quarter.", picture: "An Indian Singaporean woman at a desk with a mug" },
      { say: "Message me for the checklist.", picture: "A Eurasian Singaporean man smiling at a cafe" },
    ];
    make.mockResolvedValue(answer({ as: "explainer", scenes, caption: "Check your CPF. Message me." }));
    const done = finished();
    startRemix(UID, run(["explainer"], { voice: "lily" }));
    const j = await done;
    const d = loadDrafts(UID)[0];
    expect(ai.explainer).toHaveBeenCalledWith("Your CPF moves every month.", scenes, "lily");
    expect(splitScriptCaption(d.draft).script).toBe(scenes.map((x) => x.say).join("\n"));
    expect(j.rows[0]).toMatchObject({ state: "done", href: "/edit?panel=ai&kind=explainer" });
  });

  it("shows the video steps as the voiceover starts", async () => {
    let release!: () => void;
    make.mockResolvedValue(speaking);
    ai.speak.mockReturnValue(new Promise<Blob>((r) => (release = () => r(new Blob(["mp3"])))));
    const done = finished();
    startRemix(UID, run(["speaking"]));
    expect(writingStep("speaking")).toBe("Writing your video script");
    await vi.waitFor(() => expect(remixJob()!.step).toBe(VOICEOVER));
    release();
    await done;
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
    expect(runParams(j.key, j.run)).toEqual({ remix: "ad:123", keep: "topic", about: "insurance-basics", close: "close", mention: null, offer: "free-money-check", as: null });
    release(answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }));
    await done;
    expect(runParams("ad:1", { keep: "structure", close: "balanced", mention: true, offer: null })).toEqual({ remix: "ad:1", keep: null, about: null, close: null, mention: null, offer: null, as: null });
    expect(runParams("ad:1", { keep: "hook", about: "CPF", close: "loose", mention: false, offer: "Free money check", as: "post,carousel" })).toEqual({
      remix: "ad:1", keep: "hook", about: null, close: "loose", mention: "no", offer: null, as: "post,carousel",
    });
  });

  it("carries the formats only when they aren't the source's default", async () => {
    make.mockResolvedValue(answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }));
    let done = finished();
    startRemix(UID, run(["post"]));
    expect(remixJob()!.run.as).toBeUndefined();
    await done;
    make.mockImplementation(async (b: { as: string }) =>
      b.as === "post" ? answer({ as: "post", hook: "H", body: "B", cta: "", hashtags: [] }) : answer({ as: "carousel", hook: "H", slides: Array.from({ length: 4 }, () => ({ title: "T", body: "B" })), cta: "Save this" }),
    );
    done = finished();
    startRemix(UID, run(["carousel", "post"]));
    expect(remixJob()!.run.as).toBe("carousel,post");
    await done;
  });
});

describe("failure", () => {
  it("keeps the use and shows the server's reason when the model answered (422), and gives it back only before (502, 503)", async () => {
    const { failure } = await import("./remixJob");
    const { EdgeError } = await import("./edgeFn");
    expect(failure(new EdgeError("That remix came back in a shape that can't be used. Try again.", 422, "unusable"))).toEqual({
      error: "That remix came back in a shape that can't be used. Try again.",
      refunded: false,
    });
    expect(failure(new EdgeError("x", 502, "failed")).refunded).toBe(true);
    expect(failure(new EdgeError("x", 503, "failed")).refunded).toBe(true);
    expect(failure(new EdgeError("x", 500, "failed")).refunded).toBe(false);
  });
});
