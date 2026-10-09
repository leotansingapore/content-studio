import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { supabase } from "@/lib/supabase";
import { loadStages } from "./board";
import { getDraftById, loadDrafts, saveDrafts } from "./draftHistory";
import { splitScriptCaption } from "./scriptCaption";
import { hookFormulaSet } from "./hookFormulas";
import {
  CLONE_STEPS,
  MAX_SAVED_CLONES,
  ReelCloneError,
  buildCloneDraft,
  canReadVideo,
  cloneDraftText,
  cloneLinkFor,
  cloneReel,
  cloneStepAt,
  conceptRun,
  ctaTypeFor,
  errorCodeFor,
  loadSavedClones,
  rememberClone,
  saveCloneDraft,
  shotListText,
  startConceptBuild,
  visualsFor,
  voiceForClone,
  winnersFor,
  withConcept,
  withHook,
  type CloneResponse,
  type SavedClone,
} from "./reelClone";

// Node builds its fetch classes the first time one is used, which takes seconds on a busy
// machine: build them while this file loads, not inside a test's 5 s.
void new Response("");

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const result = (over: Partial<CloneResponse["source"]> = {}): CloneResponse => ({
  source: {
    platform: "tiktok",
    postId: "7682935406396001567",
    url: "https://www.tiktok.com/@leila_tuck/video/7682935406396001567",
    author: "leila_tuck",
    caption: "Stop paying this fee",
    transcript: "t".repeat(6000),
    isVideo: true,
    postedAt: null,
    durationSec: 35,
    metrics: { views: 1, likes: 1, comments: 1, shares: 1, saves: 1 },
    metricsAsOf: "2026-09-15T00:00:00.000Z",
    ...over,
  },
  breakdown: { hook: "h", beats: ["a", "b"], payoff: "p", cta: "c", whyItWorked: "w" },
  myVersion: {
    hook: "Your CPF isn't lazy money",
    script: "Your CPF isn't lazy money.\nHere's why.\nComment CPF for my checklist.",
    caption: "CPF isn't lazy money.\n\nComment CPF. #cpf",
    cta: "Comment CPF for my checklist",
    filmingNotes: "Face camera.",
  },
  cached: false,
  usage: { used: 1, limit: 20 },
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

describe("cloneDraftText", () => {
  it("puts the caption where Write's script/caption split finds it", () => {
    const v = result().myVersion;
    expect(splitScriptCaption(cloneDraftText(v))).toEqual({ script: v.script, caption: v.caption });
  });
});

describe("ctaTypeFor", () => {
  it.each([
    ["Comment CPF and I'll send it", "comment-keyword"],
    ["DM me GUIDE", "dm-keyword"],
    ["Save this for your next review", "save-share"],
    ["Book a no-pressure 15-min call", "book-call"],
    ["What's the one CPF question you've never had answered?", "open-question"],
    ["Follow for more", "dm-keyword"],
  ])("%s", (cta, type) => expect(ctaTypeFor(cta)).toBe(type));
});

describe("buildCloneDraft", () => {
  it("makes a short-video draft Write can restore", () => {
    const draft = buildCloneDraft("d1", result(), new Date("2026-09-15T00:00:00Z"));
    expect(draft).toMatchObject({
      id: "d1",
      hook: "Your CPF isn't lazy money",
      pillar: "topic",
      pillarDetail: "Your CPF isn't lazy money",
      audience: "general",
      format: "short-video",
      platform: "tiktok",
      ctaType: "comment-keyword",
    });
    expect(draft.draft).toContain("CAPTION:");
  });

  it("keeps the formula the chosen hook was written with", () => {
    const r = result();
    const v = { ...r.myVersion, hook: "Second hook", hookOptions: ["First hook", "Second hook"], hookFormulas: ["list", "myth-bust"] };
    expect(buildCloneDraft("d2", { ...r, myVersion: v }).hookFormula).toBe("myth-bust");
    expect(buildCloneDraft("d3", r).hookFormula).toBeUndefined();
  });
});

describe("saveCloneDraft", () => {
  const clone = (): SavedClone => ({ id: "tiktok:7682935406396001567", savedAt: "x", result: result() });

  it("creates one draft, reuses it, and puts it in Scripted when added to the board", () => {
    const opened = saveCloneDraft("u1", clone());
    expect(loadDrafts("u1")).toHaveLength(1);
    expect(loadStages("u1")).toEqual({});

    const boarded = saveCloneDraft("u1", opened, "scripted");
    expect(boarded.draftId).toBe(opened.draftId);
    expect(boarded.onBoard).toBe(true);
    expect(loadDrafts("u1")).toHaveLength(1);
    expect(loadStages("u1")).toEqual({ [opened.draftId!]: "scripted" });
    expect(loadSavedClones("u1")[0].draftId).toBe(opened.draftId);
  });

  it("never overwrites a draft the consultant already edited in Write", () => {
    const opened = saveCloneDraft("u1", clone());
    const edited = loadDrafts("u1").map((d) => ({ ...d, draft: "My edited script" }));
    saveDrafts("u1", edited);
    saveCloneDraft("u1", opened, "scripted");
    expect(getDraftById("u1", opened.draftId!)?.draft).toBe("My edited script");
  });

  it("makes a new draft if the old one was deleted", () => {
    const opened = saveCloneDraft("u1", clone());
    saveDrafts("u1", []);
    const again = saveCloneDraft("u1", opened, "scripted");
    expect(again.draftId).not.toBe(opened.draftId);
    expect(loadDrafts("u1")).toHaveLength(1);
  });
});

describe("recent clones", () => {
  it("keeps the newest per post, capped, with long transcripts trimmed", () => {
    for (let i = 0; i < MAX_SAVED_CLONES + 3; i++) {
      // String ids: these exceed Number.MAX_SAFE_INTEGER.
      const r = result({ postId: `76829354063960010${String(i).padStart(2, "0")}` });
      rememberClone("u1", { id: `tiktok:${r.source.postId}`, savedAt: String(i), result: r });
    }
    rememberClone("u1", { id: "tiktok:7682935406396001002", savedAt: "again", result: result({ postId: "7682935406396001002" }) });
    const saved = loadSavedClones("u1");
    expect(saved).toHaveLength(MAX_SAVED_CLONES);
    expect(saved[0].savedAt).toBe("again");
    expect(saved.filter((c) => c.id === "tiktok:7682935406396001002")).toHaveLength(1);
    expect(saved[0].result.source.transcript).toHaveLength(4000);
  });

  it("never keeps Instagram's expiring video link", () => {
    const r = result({ platform: "instagram", postId: "C8xYz12AbCd", videoUrl: "https://x.fbcdn.net/a.mp4" });
    rememberClone("u1", { id: "instagram:C8xYz12AbCd", savedAt: "now", result: r });
    expect(loadSavedClones("u1")[0].result.source.videoUrl).toBeNull();
    expect(r.source.videoUrl).toBe("https://x.fbcdn.net/a.mp4");
  });

  it("ignores corrupt storage and other users", () => {
    window.localStorage.setItem("content-studio-reel-clones-u1", "{not json");
    expect(loadSavedClones("u1")).toEqual([]);
    window.localStorage.setItem("content-studio-reel-clones-u1", JSON.stringify([{ id: "x", result: {} }]));
    expect(loadSavedClones("u1")).toEqual([]);
    expect(loadSavedClones(null)).toEqual([]);
  });
});

describe("voiceForClone", () => {
  const post = "I started my CPF top-ups at 25 because my dad never had the chance to, and here is what I learned along the way.";
  it("sends the summary and up to 3 real posts from a usable profile only", () => {
    expect(voiceForClone(null)).toBeNull();
    expect(voiceForClone({ posts: [post, "short"], voiceSummary: "Warm", updatedAt: "" })).toBeNull();
    const voice = voiceForClone({ posts: [post, post, post, post, "short"], voiceSummary: " Warm ", updatedAt: "" });
    expect(voice).toEqual({ summary: "Warm", samples: [post, post, post] });
  });

  it("sends the best posts even without a usable profile", () => {
    const winners = [{ hook: "Your CPF isn't lazy money", result: "4,200 views" }];
    expect(voiceForClone(null, winners)).toEqual({ summary: "", samples: [], winners });
    expect(voiceForClone(null, [])).toBeNull();
  });
});

describe("winnersFor", () => {
  const posted = (id: string, hook: string, impressions: number, reactions: number) => ({
    id,
    createdAt: "2026-09-01T00:00:00.000Z",
    hook,
    draft: hook,
    pillar: "topic",
    pillarDetail: "",
    audience: "general",
    format: "short-video",
    platform: "instagram",
    ctaType: "dm-keyword",
    status: "posted" as const,
    postedAt: "2026-09-02T00:00:00.000Z",
    metrics: { impressions, reactions, comments: 0, shares: 0 },
  });

  it("waits for 3 tracked posts, then sends the top 3 by engagement with their numbers", () => {
    saveDrafts("u1", [posted("a", "Your CPF isn't lazy money", 4200, 300), posted("b", "Three money rules", 900, 40)]);
    expect(winnersFor("u1")).toEqual([]);
    saveDrafts("u1", [
      posted("a", "Your CPF isn't lazy money", 4200, 300),
      posted("b", "Three money rules", 900, 40),
      posted("c", "The HDB loan question", 0, 90),
      posted("d", "Hi", 9000, 900),
      posted("e", "Why I stopped buying ILPs", 300, 5),
    ]);
    expect(winnersFor("u1")).toEqual([
      { hook: "Your CPF isn't lazy money", result: "4,200 views, 300 engagements, 7.1% engaged" },
      { hook: "The HDB loan question", result: "90 engagements" },
      { hook: "Three money rules", result: "900 views, 40 engagements, 4.4% engaged" },
    ]);
  });
});

describe("withHook and shotListText", () => {
  const version = {
    ...result().myVersion,
    hookOptions: ["Your CPF isn't lazy money", "Is your CPF working?", "Stop topping up blind"],
    beats: [
      { say: "Your CPF isn't lazy money", onScreen: "CPF is not lazy", visual: "To camera", seconds: 3, delivery: "Stress 'isn't'." },
      { say: "Here's why.", onScreen: "", visual: "", seconds: 6 },
    ],
  };

  it("makes the picked hook the opener and the first spoken line", () => {
    const v = withHook(version, 2);
    expect(v.hook).toBe("Stop topping up blind");
    expect(v.beats![0].say).toBe("Stop topping up blind");
    expect(v.script).toBe("Stop topping up blind\nHere's why.");
    expect(withHook(version, 7)).toBe(version);
    expect(withHook(result().myVersion, 1)).toEqual(result().myVersion);
  });

  it("writes one block per beat, preferring the shot planned from the original's look", () => {
    expect(shotListText(version.beats)).toBe(
      "1. (3s) Your CPF isn't lazy money\n   Delivery: Stress 'isn't'.\n   On screen: CPF is not lazy\n   Show: To camera\n\n2. (6s) Here's why.",
    );
    const shots = ["", "Screen recording"];
    expect(shotListText(version.beats, shots)).toContain("2. (6s) Here's why.\n   Show: Screen recording");
    expect(shotListText(version.beats, shots)).toContain("Show: To camera");
  });
});

describe("cloneLinkFor and steps", () => {
  it("links only clonable posts", () => {
    expect(cloneLinkFor("https://www.tiktok.com/@a/video/7682935406396001567?x=1")).toBe(
      "/clone?url=https%3A%2F%2Fwww.tiktok.com%2F%40a%2Fvideo%2F7682935406396001567",
    );
    expect(cloneLinkFor("https://news.example.com/story")).toBeNull();
    expect(cloneLinkFor(undefined)).toBeNull();
  });

  it("walks through the loading steps by elapsed time", () => {
    expect(cloneStepAt(0)).toBe(0);
    expect(cloneStepAt(CLONE_STEPS[1].from)).toBe(1);
    expect(cloneStepAt(CLONE_STEPS[3].from - 1)).toBe(2);
    expect(cloneStepAt(500)).toBe(3);
  });
});

describe("cloneReel", () => {
  const httpError = (status: number, body: unknown) => ({
    data: null,
    error: { name: "FunctionsHttpError", context: new Response(JSON.stringify(body), { status }) },
  });

  it("returns a good response", async () => {
    invoke.mockResolvedValue({ data: result(), error: null });
    await expect(cloneReel("https://vt.tiktok.com/ZSxyz789/", null)).resolves.toMatchObject({ cached: false });
    expect(invoke).toHaveBeenCalledWith(
      "clone-reel",
      expect.objectContaining({ body: { url: "https://vt.tiktok.com/ZSxyz789/", voice: null } }),
    );
  });

  it("shows the server's message and code for a refusal", async () => {
    invoke.mockResolvedValue(httpError(429, { code: "daily_limit", error: "You've used all 20 for today." }));
    await expect(cloneReel("u", null)).rejects.toMatchObject({
      code: "daily_limit",
      status: 429,
      message: "You've used all 20 for today.",
    });
  });

  it("falls back by status when the body isn't the function's JSON", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response("<html>Gateway Timeout</html>", { status: 504 }) } });
    await expect(cloneReel("u", null)).rejects.toMatchObject({ code: "timeout" });
    invoke.mockResolvedValue(httpError(500, { nope: true }));
    await expect(cloneReel("u", null)).rejects.toMatchObject({ code: "server_error" });
  });

  it("tells a cancel apart from a network failure", async () => {
    const controller = new AbortController();
    controller.abort();
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsFetchError", context: new Error("aborted") } });
    await expect(cloneReel("u", null, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    await expect(cloneReel("u", null)).rejects.toMatchObject({ code: "network" });
  });

  it("rejects an incomplete answer", async () => {
    invoke.mockResolvedValue({ data: { source: { url: "x" } }, error: null });
    const err = await cloneReel("u", null).catch((e) => e);
    expect(err).toBeInstanceOf(ReelCloneError);
    expect(err.code).toBe("server_error");
  });

  it("maps codes and statuses", () => {
    expect(errorCodeFor("not_found", 500)).toBe("not_found");
    expect(errorCodeFor("made_up", 404)).toBe("not_found");
    expect(errorCodeFor(undefined, 401)).toBe("unauthorized");
    expect(errorCodeFor(undefined, 503)).toBe("usage_unavailable");
    expect(errorCodeFor(undefined, 418)).toBe("server_error");
  });
});

describe("concepts", () => {
  const concepts = [
    { title: "Same topic, made for Singapore", keeps: "Pacing", changes: "Figures" },
    { title: "CPF top-ups instead", keeps: "Hook style", changes: "Topic" },
    { title: "Shot at the hawker centre", keeps: "Format", changes: "Setting" },
  ];
  const base = (): SavedClone => {
    const r = result();
    return { id: "tiktok:7682935406396001567", savedAt: "2026-09-15T00:00:00.000Z", result: { ...r, concepts }, draftId: "d0", onBoard: true };
  };
  const second = { ...result().myVersion, hook: "Top up your CPF before December", beats: [{ say: "a", onScreen: "", visual: "", seconds: 3 }] };

  it("switches to a version just written, keeping the one it leaves with its draft, and back for free", () => {
    const c1 = withConcept(base(), 1, second);
    expect(c1.concept).toBe(1);
    expect(c1.result.myVersion.hook).toBe("Top up your CPF before December");
    expect(c1.draftId).toBeUndefined();
    expect(c1.onBoard).toBeUndefined();
    expect(c1.builds?.[0]).toEqual({ version: base().result.myVersion, draftId: "d0", onBoard: true });

    const back = withConcept({ ...c1, draftId: "d1" }, 0);
    expect(back.concept).toBe(0);
    expect(back.result.myVersion).toEqual(base().result.myVersion);
    expect(back).toMatchObject({ draftId: "d0", onBoard: true });
    expect(back.builds?.[1]).toEqual({ version: second, draftId: "d1", onBoard: undefined });
    expect(JSON.parse(JSON.stringify(back)).builds).toHaveLength(2);
  });

  it("stays put on the shown concept or one not written yet", () => {
    const c = base();
    expect(withConcept(c, 0)).toBe(c);
    expect(withConcept(c, 2)).toBe(c);
  });

  it("only uses the original's look with the first concept, whose beats it was read for", () => {
    const visuals = { format: "f", hookVisual: "h", onScreenText: [], pacing: "p", visualMoves: [], myVisuals: ["x"], measured: { durationSec: 9, cuts: 1, avgShotSec: 4.5, cutsFirst3s: 0 } };
    const c = { ...base(), visuals };
    expect(visualsFor(c)).toBe(visuals);
    expect(visualsFor(withConcept(c, 1, second))).toBeNull();
    const fresh = { ...base(), result: { ...base().result, source: { ...base().result.source, videoUrl: "https://x.cdninstagram.com/v.mp4" }, myVersion: second } };
    expect(canReadVideo(fresh)).toBe(true);
    expect(canReadVideo({ ...fresh, concept: 1 })).toBe(false);
  });

  it("writes a concept from the post already read, saves it as the version and runs once at a time", async () => {
    const formulas = hookFormulaSet(0);
    rememberClone("u1", base());
    let finish!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((r) => (finish = r)));
    const voice = { summary: "Warm", samples: [] };
    const run = startConceptBuild("u1", base(), 2, voice, formulas);
    expect(startConceptBuild("u1", base(), 1, voice, formulas)).toBe(run);
    expect(conceptRun(base().id)?.index).toBe(2);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body).toEqual({
      url: base().result.source.url,
      voice,
      formulas: formulas.map(({ name, template, example, trap }) => ({ name, template, example, trap })),
      concept: concepts[2],
    });
    finish({ data: { myVersion: { ...second, hookOptions: ["a", "b", "c"] }, usage: { used: 1, limit: 20 } }, error: null });
    const updated = await run;
    expect(updated.concept).toBe(2);
    expect(updated.result.myVersion.hookFormulas).toEqual(formulas.map((f) => f.id));
    expect(loadSavedClones("u1")[0].concept).toBe(2);
    expect(loadSavedClones("u1")[0].builds?.[0]?.draftId).toBe("d0");
    expect(conceptRun(base().id)).toBeNull();
  });

  it("refuses an incomplete version and shows the server's refusal", async () => {
    invoke.mockResolvedValue({ data: { myVersion: { hook: "x" } }, error: null });
    await expect(startConceptBuild("u1", base(), 1, null)).rejects.toMatchObject({ code: "server_error" });
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ code: "daily_limit", error: "You've used all 20 for today." }), { status: 429 }) },
    });
    await expect(startConceptBuild("u1", base(), 1, null)).rejects.toMatchObject({ code: "daily_limit", message: "You've used all 20 for today." });
    expect(loadSavedClones("u1")).toEqual([]);
  });

  it("sends the hook formulas with a clone and tags the hooks with their ids", async () => {
    const formulas = hookFormulaSet(1);
    invoke.mockResolvedValue({ data: { ...result(), myVersion: { ...result().myVersion, hookOptions: ["a", "b", "c"] } }, error: null });
    const r = await cloneReel("u", null, undefined, formulas);
    expect(invoke.mock.calls[0][1].body.formulas.map((f: { name: string }) => f.name)).toEqual(formulas.map((f) => f.name));
    expect(r.myVersion.hookFormulas).toEqual(formulas.map((f) => f.id));
    invoke.mockResolvedValue({ data: { ...result(), myVersion: { ...result().myVersion, hookOptions: ["a"] } }, error: null });
    expect((await cloneReel("u", null, undefined, formulas)).myVersion.hookFormulas).toBeUndefined();
  });
});
