// The editor serves everyone. Rendered to markup in node (no effects run, so the video is "loading"): a project
// without an AI mark draws exactly as it did before people-dub-lipsync's Script card, for Leo and everyone else, and
// with ?script=1&lang=zh in the address; a project with a mark draws as before for everyone else (sha256 of the
// markup, pinned on today's code at ca211072).
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditSettings } from "@/lib/videoEdit";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })), getUser: vi.fn(async () => ({ data: { user: null } })), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false }));
// the shared tab row over the start screen reads the rails store, which has no server snapshot; not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), WRITE_TABS: [] }));

const { Editor, Start, videoTarget, versionPrice, versionUses, withBeats } = await import("./VideoEditPage");
const { defaultSettings } = await import("@/lib/videoEdit");
const prices = await import("@/lib/prices");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const plain = {
  id: "v1", name: "Clip", createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "", duration: 12, size: 1000,
  words: [{ w: "Most", s: 0, e: 0.4 }, { w: "people", s: 0.4, e: 0.9 }, { w: "plan.", s: 5, e: 5.6 }], settings: defaultSettings("bold"), thumb: "",
};
const marked = {
  ...plain,
  ai: {
    kind: "avatar" as const, person: "presenter" as const, who: "pr-1", voice: "premade" as const, voiceId: "alice" as const, madeAt: "2026-10-21T09:00:00.000Z",
    slices: [{ text: "", start: 0, end: 4.8, clip: "ai-slice-j1-0-0" }, { text: "", start: 4.8, end: 12, clip: "ai-slice-j1-1-0" }],
  },
};
const html = (project: typeof plain, leo: boolean, at = "/edit?p=v1") =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(Editor, { userId: "u1", leo, project, onSave: () => {}, onOpen: () => {}, onBack: () => {} })));

const PLAIN = "7074e298d92dc25a88686897f9843816caa81d4bf795697570951ea1da3aa345";
const PLAIN_LEO = "78e6d6ed50704ed712474f1d863a2787a4ed611bde261c0631262785a268259e";

describe("the editor for a project the AI didn't make", () => {
  it("draws as before for everyone else and for Leo, with or without ?script and ?lang", () => {
    const everyone = html(plain, false);
    const leo = html(plain, true);
    expect(everyone).toContain("Loading the video...");
    expect(sha(everyone)).toBe(PLAIN);
    expect(sha(leo)).toBe(PLAIN_LEO);
    expect(html(plain, false, "/edit?p=v1&script=1&lang=zh")).toBe(everyone);
    expect(html(plain, true, "/edit?p=v1&script=1&lang=zh")).toBe(leo);
  });

  it("draws an AI video as before for everyone else, Script card params and all", () => {
    expect(html(marked, false)).toBe(html(plain, false));
    expect(html(marked, false, "/edit?p=v1&script=1&lang=zh")).toBe(html(plain, false));
  });
});

describe("Recent on the start screen", () => {
  // a clip found in a 9:05.5 recording (live check 22 Oct): the recording's duration, the clip in its trims
  const clip = { ...plain, id: "v2", name: "Webinar - Follow up the same day", duration: 545.5, settings: { ...defaultSettings("bold"), trimStart: 100, trimEnd: 545.5 - 118.5 } };
  const lengths = (projects: (typeof plain)[]) => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/edit"] }, createElement(Start, { userId: "u1", leo: false, busy: "", projects, onUpload: () => {}, onOpen: () => {}, onRemove: () => {} })));
    return [...markup.matchAll(/<span class="block text-\[11px\] text-muted-foreground">([^<]*)<\/span>/g)].map((m) => m[1]);
  };

  it("shows the length each project plays: a whole video's, a clip's own and a trimmed video's (live check 22 Oct)", () => {
    const trimmed = { ...plain, id: "v3", settings: { ...defaultSettings("bold"), trimStart: 1.5, trimEnd: 0.5 } };
    expect(lengths([plain, clip, trimmed])).toEqual(["0:12.0", "0:18.5", "0:10.0"]);
  });
});

describe("the page's first frame for everyone else (pinned on today's code at 4403dedf)", () => {
  it("draws today's start screen, with or without ?ask=", async () => {
    const { default: VideoEditPage } = await import("./VideoEditPage");
    const page = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(VideoEditPage)));
    await expect(page("/edit")).toMatchFileSnapshot("./__pins__/video-edit-page-everyone.html");
    expect(page("/edit?p=v1&ask=bigger%20yellow%20captions%20at%20the%20top")).toBe(page("/edit?p=v1"));
  });

  it("draws an open project the same with ?ask=, for everyone else and for Leo", () => {
    expect(sha(html(plain, false, "/edit?p=v1&ask=add%20music"))).toBe(PLAIN);
    expect(sha(html(plain, true, "/edit?p=v1&ask=add%20music"))).toBe(PLAIN_LEO);
  });
});

describe("the vibe box run (pinned on today's code at 4403dedf)", () => {
  it("posts vibe mode with the edit's settings, words and length, and the patch changes only what it names", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify({ patch: { position: "top", size: 1.3, activeColor: "#ffd400", music: true }, reply: "Bigger yellow captions at the top." }), { status: 200 });
    }));
    const { vibeEdit } = await import("@/lib/videoProjects");
    const { applyPatch } = await import("@/lib/videoEdit");
    const settings = { ...defaultSettings("bold"), captionY: 0.7 };
    const res = await vibeEdit({ instruction: "bigger yellow captions at the top", settings, transcript: "Most people plan.", duration: 12 });
    expect(sent.map((s) => s.url)).toEqual(["https://abc.supabase.co/functions/v1/video-assist"]);
    expect(sent[0].init.method).toBe("POST");
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ mode: "vibe", instruction: "bigger yellow captions at the top", settings, transcript: "Most people plan.", duration: 12 });
    expect(res.reply).toBe("Bigger yellow captions at the top.");
    const { next, changed } = applyPatch(settings, res.patch);
    expect(changed).toEqual(["position", "captionY", "size", "activeColor"]);
    expect(next).toEqual({ ...settings, position: "top", captionY: undefined, size: 1.3, activeColor: "#FFD400" });
    vi.unstubAllGlobals();
  });
});

describe("the open video as the agent's edit target (Leo only)", () => {
  const setup = (patch: Record<string, unknown>, reply = "Bigger yellow captions at the top.") => {
    const io = {
      now: { ...defaultSettings("bold"), captionY: 0.7 } as EditSettings,
      live: true,
      vibes: [] as string[],
      sets: 0,
    };
    const target = videoTarget({
      title: () => "Clip",
      settings: () => io.now,
      vibe: async (instruction) => (io.vibes.push(instruction), { patch, reply }),
      set: (next) => ((io.now = next), io.sets++),
      open: () => io.live,
    });
    return { io, target };
  };

  it("proposes through vibe edit and changes nothing; Use this changes the settings once; Undo puts back only those keys", async () => {
    const { io, target } = setup({ position: "top", size: 1.3, activeColor: "#ffd400" });
    const p = await target.propose("bigger yellow captions at the top", null);
    expect(io.vibes).toEqual(["bigger yellow captions at the top"]);
    expect(io.sets).toBe(0);
    expect([target.kind, target.title, p.reply, p.preview, p.flags]).toEqual(["video", "Clip", "Bigger yellow captions at the top.", "Captions at the top, captions 1.3 times the usual size, the spoken word in yellow", []]);
    // a change made on the page after the proposal stays
    io.now = { ...io.now, uppercase: !io.now.uppercase };
    const was = io.now;
    const r = p.apply();
    expect(io.sets).toBe(1);
    expect(r.done).toBe('Done. "Clip" changed. Undo here or on the page.');
    expect(io.now).toEqual({ ...was, position: "top", captionY: undefined, size: 1.3, activeColor: "#FFD400" });
    io.now = { ...io.now, maxPause: 0.2 };
    r.undo();
    expect(io.now).toEqual({ ...was, maxPause: 0.2 });
  });

  it("a change the editor can't make proposes nothing, so the agent answers with the reply", async () => {
    const { io, target } = setup({ music: true }, "I can't add music by asking yet. Add it in the Cuts tab.");
    const p = await target.propose("add music", null);
    expect([p.preview, p.reply, io.sets]).toEqual(["", "I can't add music by asking yet. Add it in the Cuts tab.", 0]);
  });

  it("a closed video takes no change and no undo", async () => {
    const { io, target } = setup({ size: 1.3 });
    const p = await target.propose("bigger", null);
    const r = p.apply();
    io.live = false;
    expect(() => r.undo()).toThrow();
    expect(() => p.apply()).toThrow();
    expect(io.sets).toBe(1);
  });
});

describe("versions of a same edit (remix-format-clone, Leo only)", () => {
  // the plan: a hook with its on-screen hook, a point with a cutaway, an ask with a zoom; the base video is a presenter's
  const plan = {
    v: 1 as const, id: "ep-1", source: "clone:instagram:C1", at: "2026-10-25T01:00:00.000Z",
    read: { seconds: 30, aspect: "9:16" as const, wpm: 160, look: null, cutsPerMin: 20, music: null, sfx: false, people: 1 as const, cutaways: "full" as const, skipped: [] },
    beats: [{ role: "hook" as const, share: 0.3, shots: [] }, { role: "point" as const, share: 0.4, shots: [] }, { role: "ask" as const, share: 0.3, shots: [] }],
    events: [
      { kind: "text" as const, place: { b: 0, at: 0, span: 1 }, role: "hook" as const, words: 1, y: 0.2 },
      { kind: "cutaway" as const, place: { b: 1, at: 0.2, span: 0.5 }, picture: "stock" as const },
      { kind: "zoom" as const, place: { b: 2, at: 0, span: 0.3 } },
    ],
  };
  const base = {
    id: "ev-1", host: { kind: "presenter" as const, id: "pr-1" }, voice: "alice" as const, lang: "en" as const, offer: null,
    lines: ["Most", "people", "plan."], marks: [{ k: 0, line: 0, word: 0 }, { k: 1, line: 1, word: 0 }], texts: [{ k: 0, text: "MOST" }], searches: [{ k: 1, search: "office desk" }],
    caption: "", at: "2026-10-25T01:05:00.000Z",
  };
  // its two Speak parts say "Most people" (0 to 4.8 s) and "plan." (4.8 to 12 s), from the project's word times
  const planned = { ...marked, plan: { id: "ep-1", version: "ev-1" } };
  const hook = { formula: "contrarian", r: { lines: ["Stop", "skip", "this."], marks: [{ k: 0, line: 0, word: 0 }, { k: 1, line: 1, word: 0 }], texts: [{ k: 0, text: "STOP" }], searches: [{ k: 1, search: "beach" }] } };

  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map([["content-studio-edit-plans-u1", JSON.stringify([{ plan, versions: [base] }])]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: () => null, length: 0 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("takes only the hook beat's line, markers, on-screen text and search from a written hook", () => {
    expect(withBeats(plan, base, hook.r, new Set([0]))).toEqual({
      lines: ["Stop", "people", "plan."],
      marks: [{ k: 1, line: 1, word: 0 }, { k: 0, line: 0, word: 0 }],
      texts: [{ k: 0, text: "STOP" }],
      searches: [{ k: 1, search: "office desk" }],
    });
  });

  it("prices each box before the press: the voice and the Speak parts its change remakes, and only the writing on a filmed take", () => {
    const b = { plan, base, project: planned };
    const { priceOf, sumPrices } = prices;
    expect(versionPrice(b, { change: "hook", hook })).toEqual(sumPrices(priceOf("ai-voice"), priceOf("edit-version", { slices: [4.8] })));
    expect(versionPrice(b, { change: "offer", offer: "Hospital plan check" })).toEqual(sumPrices(priceOf("remix-make"), priceOf("ai-voice"), priceOf("edit-version", { slices: [7.2] })));
    expect(versionPrice(b, { change: "host", who: "mine" })).toEqual(priceOf("edit-version", { slices: [4.8, 7.2] }));
    expect(versionPrice(b, { change: "lang", lang: "ms" })).toEqual(sumPrices(priceOf("ai-voice"), priceOf("edit-version", { slices: [4.8, 7.2] })));
    expect(versionPrice({ ...b, base: { ...base, host: { kind: "none" } } }, { change: "hook", hook })).toEqual(priceOf("ai-voice"));
    expect(versionPrice({ ...b, base: { ...base, host: { kind: "film" } } }, { change: "hook", hook })).toBeNull();
    expect(versionPrice({ ...b, base: { ...base, host: { kind: "film" } } }, { change: "offer", offer: "Hospital plan check" })).toEqual(priceOf("remix-make"));
  });

  it("counts edit-version once a face version, a voice for every version but a new face, and a remix for each offer", () => {
    const asks = [{ change: "hook" as const, hook }, { change: "host" as const, who: "mine" }, { change: "offer" as const, offer: "Review" }];
    expect(versionUses("face", asks)).toEqual({ "edit-version": 3, "ai-voice": 2, "remix-make": 1 });
    expect(versionUses("none", asks.slice(0, 1))).toEqual({ "ai-voice": 1 });
    expect(versionUses("film", asks)).toEqual({ "remix-make": 1 });
  });

  it("shows Leo a Versions button on a project made from a plan, and the panel's rows with versions=1; nobody else sees any of it", () => {
    const closed = html(planned, true);
    expect(closed).toContain("Versions of this edit");
    expect(closed).toMatch(/<button[^>]*>Versions<\/button>/);
    expect(closed).not.toContain("New hook");
    const open = html(planned, true, "/edit?p=v1&versions=1");
    for (const row of ["New hook", "Write 3 hooks", "Language", "Malay"]) expect(open).toContain(row);
    expect(open).toMatch(/<button[^>]*disabled=""[^>]*>Make versions<\/button>/);
    expect(open).toContain("Tick a box for each version you want.");
    // written hooks wait on this device, with Jev's pick marked
    store.set("cs-edit-versions-ep-1", JSON.stringify({ hooks: [hook, { ...hook, formula: "question", r: { ...hook.r, lines: ["Why", "skip", "this?"] } }], rec: 1, langs: {} }));
    const hooks = html(planned, true, "/edit?p=v1&versions=1");
    expect(hooks).toContain("&quot;Stop&quot;");
    expect(hooks).toMatch(/&quot;Why&quot;<\/span><span[^>]*>Recommended/);
    expect(hooks).toContain("Write 3 more");
    expect(html(planned, false, "/edit?p=v1&versions=1")).toBe(html(plain, false));
    // a plan gone from this device shows no card
    store.clear();
    expect(html(planned, true, "/edit?p=v1&versions=1")).not.toContain("Versions of this edit");
  });

});
