import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SAVED_BRIEFS,
  addBriefToBoard,
  addBriefs,
  briefWriteUrl,
  buildIdeaDumpContext,
  isOnBoard,
  loadBriefs,
  outcomeForFailure,
  outcomeForSuccess,
  removeBrief,
  scoreBrief,
  updateBrief,
  type IdeaBrief,
} from "./ideaDump";
import { loadDrafts } from "./draftHistory";
import { loadStages } from "./board";

const USER = "11111111-2222-3333-4444-555555555555";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const brief = (over: Partial<IdeaBrief> = {}): IdeaBrief => ({
  id: "b1",
  createdAt: "2026-09-15T00:00:00.000Z",
  source: "why young adults skip hospital plans",
  note: 1,
  idea: "Why young adults put off hospital cover",
  angle: "Skipping cover at 25 feels smart until the first ward bill arrives.",
  hooks: [
    "Would a $20,000 hospital bill wipe out your savings?",
    "Hospital cover, explained for people in their twenties",
    "Here's why most 25-year-olds skip hospital plans",
  ],
  talkingPoints: ["What MediShield Life covers", "Where the gaps show up", "How to review your cover"],
  cta: "Comment WARD and I'll send the checklist.",
  ctaType: "comment-keyword",
  format: "carousel",
  platform: "instagram",
  funnelStage: "trust",
  stageReason: "Teaches a real pain point.",
  chosenHook: 0,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scoreBrief", () => {
  it("scores a complete, compliant brief with the Coach's hook and CTA rules", () => {
    const s = scoreBrief(brief());
    expect(s.strongHooks).toEqual([true, false, true]);
    expect(s.clearAsk).toBe(true);
    expect(s.developed).toBe(true);
    expect(s.compliant).toBe(true);
    expect(s.score).toBe(Math.round((35 * 2) / 3) + 25 + 20 + 20);
    expect(s.issue).toBe("");
  });

  it("flags regulated phrases and puts them first", () => {
    const s = scoreBrief(brief({ talkingPoints: ["A risk-free way to grow savings", "b", "c"] }));
    expect(s.compliant).toBe(false);
    expect(s.flags.map((f) => f.ruleId)).toContain("risk-free");
    expect(s.issue).toMatch(/regulated phrase/);
    expect(s.score).toBe(Math.round((35 * 2) / 3) + 25 + 20);
  });

  it("shows warnings without failing compliance", () => {
    const s = scoreBrief(brief({ angle: "Nothing here is guaranteed, so plan for gaps." }));
    expect(s.flags.map((f) => f.ruleId)).toEqual(["guarantee"]);
    expect(s.compliant).toBe(true);
  });

  it("names the weakest part when hooks, ask or substance are missing", () => {
    expect(scoreBrief(brief({ hooks: ["Hospital cover basics", "Cover in your twenties"] })).issue).toMatch(/No hook/);
    expect(scoreBrief(brief({ cta: "Thanks for reading." })).issue).toMatch(/clear ask/);
    expect(scoreBrief(brief({ talkingPoints: ["one", "two"] })).issue).toMatch(/talking point/);
  });
});

describe("responses", () => {
  it("shows the server's daily limit message", () => {
    expect(outcomeForFailure(429, { code: "daily_limit", error: "You've used all 30 for today." })).toEqual({
      kind: "limit",
      message: "You've used all 30 for today.",
    });
  });

  it("maps no usable ideas, server errors and network failures", () => {
    expect(outcomeForFailure(422, { code: "no_ideas", error: "Add more." })).toMatchObject({ kind: "no-ideas", message: "Add more." });
    expect(outcomeForFailure(500, { error: "Couldn't develop your ideas." })).toEqual({
      kind: "error",
      message: "Couldn't develop your ideas.",
    });
    expect(outcomeForFailure(502, null)).toMatchObject({ kind: "error" });
    expect(outcomeForFailure(0, null).kind).toBe("error");
    expect((outcomeForFailure(0, null) as { message: string }).message).toMatch(/connection/);
  });

  it("turns a success into briefs that remember their note and pick a strong hook", () => {
    const { id: _id, createdAt: _c, source: _s, chosenHook: _h, boardDraftId: _b, ...payload } = brief({
      hooks: ["Hospital cover basics", "Would a ward bill wipe out your savings?", "Cover in your twenties"],
    });
    const out = outcomeForSuccess(
      { briefs: [payload], skipped: [{ note: 2, idea: "hmm", reason: "Too vague." }], usage: { used: 3, limit: 30 } },
      ["why young adults skip hospital plans", "hmm what about"],
      new Date("2026-09-15T01:00:00.000Z"),
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.briefs[0]).toMatchObject({
      source: "why young adults skip hospital plans",
      chosenHook: 1,
      createdAt: "2026-09-15T01:00:00.000Z",
    });
    expect(out.briefs[0].id).toBeTruthy();
    expect(out.usage).toEqual({ used: 3, limit: 30 });
    expect(out.skipped).toHaveLength(1);
  });

  it("treats an empty or malformed success as not developed", () => {
    expect(outcomeForSuccess({ briefs: [], skipped: [{ note: 1, idea: "x", reason: "Vague." }] }, ["x y z"]).kind).toBe("no-ideas");
    expect(outcomeForSuccess({ briefs: [] }, ["x y z"]).kind).toBe("error");
    expect(outcomeForSuccess("nope", ["x y z"]).kind).toBe("error");
  });
});

describe("briefWriteUrl", () => {
  it("prefills Write with the brief, the chosen hook and the funnel stage", () => {
    const url = briefWriteUrl(brief({ chosenHook: 2 }), "young-adult");
    expect(url.startsWith("/generate?")).toBe(true);
    const p = new URLSearchParams(url.slice("/generate?".length));
    expect(p.get("pillar")).toBe("topic");
    expect(p.get("detail")).toBe("Why young adults put off hospital cover");
    expect(p.get("format")).toBe("carousel");
    expect(p.get("platform")).toBe("instagram");
    expect(p.get("cta")).toBe("comment-keyword");
    expect(p.get("funnel")).toBe("trust");
    expect(p.get("audience")).toBe("young-adult");
    expect(p.get("ctx")).toContain('Open with this hook: "Here\'s why most 25-year-olds skip hospital plans"');
    expect(p.get("ctx")).toContain("(2) Where the gaps show up");
    expect(p.get("ctx")).toContain("Funnel stage: Building Trust.");
  });

  it("leaves out an audience Write doesn't know", () => {
    expect(new URLSearchParams(briefWriteUrl(brief(), "aliens").split("?")[1]).has("audience")).toBe(false);
  });
});

describe("storage", () => {
  it("keeps the newest briefs first, capped", () => {
    for (let i = 0; i < MAX_SAVED_BRIEFS + 5; i++) addBriefs(USER, [brief({ id: `b${i}` })]);
    const saved = loadBriefs(USER);
    expect(saved).toHaveLength(MAX_SAVED_BRIEFS);
    expect(saved[0].id).toBe(`b${MAX_SAVED_BRIEFS + 4}`);
  });

  it("drops malformed entries and repairs an out-of-range hook choice", () => {
    window.localStorage.setItem(
      `content-studio-ideadump-${USER}`,
      JSON.stringify([{ id: "bad" }, "junk", { ...brief(), chosenHook: 7, format: "podcast" }]),
    );
    expect(loadBriefs(USER)).toEqual([brief({ format: "text-post" })]);
    window.localStorage.setItem(`content-studio-ideadump-${USER}`, "{not json");
    expect(loadBriefs(USER)).toEqual([]);
    expect(loadBriefs(null)).toEqual([]);
  });

  it("updates and removes by id", () => {
    addBriefs(USER, [brief({ id: "a" }), brief({ id: "b" })]);
    expect(updateBrief(USER, "a", { chosenHook: 2 })[0].chosenHook).toBe(2);
    expect(removeBrief(USER, "a").map((b) => b.id)).toEqual(["b"]);
  });
});

describe("addBriefToBoard", () => {
  it("adds an unwritten card to the Idea column that opens with the brief", () => {
    const id = addBriefToBoard(USER, brief({ chosenHook: 2 }), "parent");
    const card = loadDrafts(USER).find((d) => d.id === id);
    expect(card).toMatchObject({
      hook: "Here's why most 25-year-olds skip hospital plans",
      draft: "",
      pillar: "topic",
      audience: "parent",
      format: "carousel",
      platform: "instagram",
      ctaType: "comment-keyword",
    });
    expect(card?.pillarDetail).toContain("Angle: Skipping cover at 25");
    expect(loadStages(USER)[id]).toBe("idea");
  });

  it("doesn't add the same card twice", () => {
    const id = addBriefToBoard(USER, brief());
    expect(addBriefToBoard(USER, brief({ boardDraftId: id }))).toBe(id);
    expect(addBriefToBoard(USER, brief({ id: "other" }))).toBe(id);
    expect(loadDrafts(USER)).toHaveLength(1);
    expect(isOnBoard(brief({ boardDraftId: id }), loadDrafts(USER))).toBe(true);
    expect(isOnBoard(brief({ boardDraftId: "gone" }), loadDrafts(USER))).toBe(false);
  });
});

describe("buildIdeaDumpContext", () => {
  it("sends the voice summary, positioning and the platforms they use most", () => {
    const s = window.localStorage;
    s.setItem(`content-studio-voice-${USER}`, JSON.stringify({ posts: ["long post"], voiceSummary: "Warm and direct.", updatedAt: "" }));
    s.setItem(
      `content-studio-positioning-${USER}`,
      JSON.stringify({ oneLiner: "I help parents plan", topics: ["CPF"], platform: "facebook", audience: "parent" }),
    );
    s.setItem(
      `content-studio-drafts-${USER}`,
      JSON.stringify([{ platform: "tiktok" }, { platform: "instagram" }, { platform: "tiktok" }, { platform: "myspace" }]),
    );
    const ctx = buildIdeaDumpContext(USER);
    expect(ctx.voice).toBe("Warm and direct.");
    expect(ctx.positioning).toMatchObject({ oneLiner: "I help parents plan", topics: ["CPF"] });
    expect(ctx.platforms).toEqual(["facebook", "tiktok", "instagram"]);
  });

  it("sends nothing when nothing is saved", () => {
    expect(buildIdeaDumpContext(USER)).toEqual({ voice: "", positioning: null, platforms: [] });
  });
});
