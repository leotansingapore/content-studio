import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { supabase } from "@/lib/supabase";
import { loadStages } from "./board";
import { getDraftById, loadDrafts, saveDrafts } from "./draftHistory";
import { splitScriptCaption } from "./scriptCaption";
import {
  CLONE_STEPS,
  MAX_SAVED_CLONES,
  ReelCloneError,
  buildCloneDraft,
  cloneDraftText,
  cloneLinkFor,
  cloneReel,
  cloneStepAt,
  ctaTypeFor,
  errorCodeFor,
  loadSavedClones,
  rememberClone,
  saveCloneDraft,
  voiceForClone,
  type CloneResponse,
  type SavedClone,
} from "./reelClone";

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
