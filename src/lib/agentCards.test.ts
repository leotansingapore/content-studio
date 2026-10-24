import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNDONE,
  canEdit,
  estimateScript,
  needsCard,
  newCardId,
  nextCard,
  priceLine,
  runUndo,
  type AgentAct,
  type AgentCard,
  type AgentPick,
} from "@/lib/agentCards";
import { needsOf } from "@/lib/agentBudget";
import { loadCampaigns } from "@/lib/campaigns";
import { loadCarousels, saveCarousel } from "@/lib/carousel";
import { addCompetitor, loadCompetitors, removeCompetitor } from "@/lib/competitors";
import { loadDrafts, saveDrafts, setDraftStatus, type DraftEntry } from "@/lib/draftHistory";
import { AVATAR_MAX, priceOf, sumPrices, type Price } from "@/lib/prices";
import { addLearning, isOn, loadLearnings, setLearningOff } from "@/lib/voiceMemory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
let full = false;

beforeEach(() => {
  store.clear();
  full = false;
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException("full", "QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, dispatchEvent: () => true });
});

const pick = (act: AgentAct, o: Partial<AgentPick> = {}): AgentPick => ({
  act, format: null, length: null, who: null, audience: null, weeks: null, pace: null, slide: null, which: null, skill: null,
  post: null, day: null, time: null, scope: null, ...o,
});

describe("needsCard", () => {
  const P = { act: 0.9, post: 0.9, day: 0.9 };
  it("is true for every make and every change, in either mode", () => {
    for (const format of ["post", "carousel", "script", "slideshow", "wall", "speaking", "explainer", "image"] as const) {
      expect(needsCard(pick("make", { format }), P, "ask")).toBe(true);
      expect(needsCard(pick("remix", { format }), P, "auto")).toBe(true);
    }
    for (const act of ["competitor", "campaign", "move", "write", "remember", "edit", "answer", "engage_replies", "engage_dms", "engage_thread", "engage_comment"] as const)
      expect(needsCard(pick(act, { post: 0, day: "2026-10-24" }), P, "ask")).toBe(true);
  });
  it("is false for answers, forget (undo) and a typed approve or decline", () => {
    for (const act of ["week", "capabilities", "refuse", "budget", "memory", "check", "forget", "approve", "decline"] as const)
      expect(needsCard(pick(act), P, "ask")).toBe(false);
  });
  it("lets a move skip its card only in auto mode, with a day, and both cuts held", () => {
    const move = pick("move", { post: 2, day: "2026-10-24", time: "09:00" });
    expect(needsCard(move, { act: 0.85, post: 0.8, day: 0.8 }, "auto")).toBe(false);
    expect(needsCard(move, { act: 0.85, post: 0.8, day: 0.8 }, "ask")).toBe(true);
    expect(needsCard(move, { act: 0.84, post: 0.9, day: 0.9 }, "auto")).toBe(true);
    expect(needsCard(move, { act: 0.9, post: 0.79, day: 0.9 }, "auto")).toBe(true);
    expect(needsCard(move, { act: 0.9, post: 0.9, day: 0.79 }, "auto")).toBe(true);
    expect(needsCard(move, { act: 0.9, post: 0.9, day: null }, "auto")).toBe(true);
    expect(needsCard({ ...move, day: null }, { act: 0.9, post: 0.9, day: 0.9 }, "auto")).toBe(true);
    expect(needsCard(pick("write", { post: 2 }), { act: 0.99, post: 0.99, day: 0.99 }, "auto")).toBe(true);
  });
});

describe("estimateScript and priceLine", () => {
  it("a 40-word script in Alice's voice is about 16 s, 44 credits, and the video with its voiceover from the price table", () => {
    const e = estimateScript(40);
    expect(e).toEqual({ seconds: 40 / 2.56, credits: 44, price: sumPrices(priceOf("ai-video", { slices: [9.5, 6.5] }), priceOf("ai-voice")) });
    const card = { price: e.price, credits: e.credits, needs: needsOf("speaking", { write: false }) };
    expect(priceLine(card, null)).toBe("About US$2.77 | about 44 Higgsfield credits");
    // the 44 credits alone, as the spec's "About US$2.75" counts them
    expect(priceLine({ price: priceOf("ai-video", { slices: [9.5, 6.5] }) as Price, credits: 44, needs: [] }, null)).toBe("About US$2.75 | about 44 Higgsfield credits");
  });
  it("Eric's 46 words are three parts, 55 credits, as live-p5dog's post 18 cost, and a new presenter adds its picture", () => {
    expect(estimateScript(46, { voice: "eric" })).toMatchObject({ credits: 55 });
    expect(priceLine({ ...estimateScript(46, { voice: "eric" }), needs: needsOf("speaking", { write: false }) }, 1)).toBe("About US$3.46 | about 55 Higgsfield credits | 1 of 2 videos left today");
    expect(estimateScript(46, { voice: "eric", presenter: true }).price.usd).toBeCloseTo(estimateScript(46, { voice: "eric" }).price.usd + (priceOf("ai-image") as Price).usd, 9);
    expect(estimateScript(200).seconds).toBe(30);
  });
  it("before a script, the dearest video says up to, with no about on the credits", () => {
    const card = { price: AVATAR_MAX, credits: 88, needs: needsOf("speaking", { write: false }) };
    expect(priceLine(card, 1)).toBe("Up to US$5.50 | 88 Higgsfield credits | 1 of 2 videos left today");
  });
  it("cheap cards show their price and uses left, and a card with nothing to show has no line", () => {
    expect(priceLine({ price: priceOf("ai-image") as Price, needs: needsOf("image") }, 4)).toBe("Under US$0.01 | 4 of 5 pictures left today");
    expect(priceLine({ price: priceOf("remix-make") as Price, needs: needsOf("post") }, 28)).toBe("About US$0.02 | 28 of 30 remixes left today");
    expect(priceLine({ needs: [] }, null)).toBeNull();
  });
});

describe("card states", () => {
  const NOW = new Date("2026-10-22T14:27:00Z");
  const card: AgentCard = {
    id: newCardId(NOW), kind: "video", step: "video", title: "Talking video", line: "A 16-second video of you saying this script.",
    script: ["Most people never check what CPF LIFE will pay them."], needs: needsOf("speaking", { write: false }), plan: {},
    status: "proposed", proposedAt: "2026-10-22T14:25:00.000Z",
  };
  it("goes proposed, starting, approved, and an approved card can't be edited", () => {
    expect(canEdit(card)).toBe(true);
    const starting = nextCard(card, { type: "approve" }, NOW)!;
    expect(starting).toMatchObject({ status: "starting", decidedAt: NOW.toISOString() });
    expect(canEdit(starting)).toBe(false);
    const approved = nextCard(starting, { type: "started" })!;
    expect(approved.status).toBe("approved");
    expect(canEdit(approved)).toBe(false);
    expect(nextCard(approved, { type: "approve" })).toBeNull();
    expect(nextCard(approved, { type: "decline" })).toBeNull();
  });
  it("goes proposed to declined, and failed back to proposed on Try again", () => {
    expect(nextCard(card, { type: "decline" }, NOW)).toMatchObject({ status: "declined", decidedAt: NOW.toISOString() });
    expect(nextCard(card, { type: "fail", error: "x" })).toBeNull();
    const failed = nextCard(nextCard(card, { type: "approve" }, NOW)!, { type: "fail", error: "Higgsfield said no." })!;
    expect(failed).toMatchObject({ status: "failed", error: "Higgsfield said no." });
    const again = nextCard(failed, { type: "retry" })!;
    expect(again.status).toBe("proposed");
    expect(again.error).toBeUndefined();
    expect(again.decidedAt).toBeUndefined();
    expect(canEdit(again)).toBe(true);
  });
  it("an edit's second press shows its preview as proposed again", () => {
    const edit: AgentCard = { ...card, kind: "edit", step: "write" };
    const next = nextCard(nextCard(edit, { type: "approve" }, NOW)!, { type: "next", step: "apply", patch: { preview: "Topping up your CPF?", flags: ["guaranteed"] } })!;
    expect(next).toMatchObject({ status: "proposed", step: "apply", preview: "Topping up your CPF?", flags: ["guaranteed"] });
    expect(nextCard(edit, { type: "next", step: "apply" })).toBeNull();
  });
  it("ids are k and base 36, never uuid-shaped", () => {
    expect(card.id).toMatch(/^k[0-9a-z]+$/);
    expect(card.id).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe("runUndo", () => {
  const draft = (id: string, o: Partial<DraftEntry> = {}): DraftEntry => ({
    id, createdAt: "2026-10-22T01:00:00.000Z", hook: `Hook ${id}`, draft: "Words", pillar: "topic", pillarDetail: "", audience: "general",
    format: "carousel", platform: "instagram", ctaType: "comment-keyword", ...o,
  });

  it("delete-drafts removes the drafts and their saved carousels, and says it changed once they are gone or posted", () => {
    saveDrafts(UID, [draft("a1"), draft("b2"), draft("keep")]);
    saveCarousel(UID, { id: "d:a1", title: "A", platform: "instagram", slides: [{ id: "s1", title: "One", body: "" }], draftId: "a1" });
    saveCarousel(UID, { id: "d:keep", title: "K", platform: "instagram", slides: [{ id: "s1", title: "One", body: "" }], draftId: "keep" });
    expect(runUndo(UID, { kind: "delete-drafts", ids: ["a1", "b2"] })).toBe(UNDONE);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["keep"]);
    expect(loadCarousels(UID).map((c) => c.id)).toEqual(["d:keep"]);
    expect(runUndo(UID, { kind: "delete-drafts", ids: ["a1", "b2"] })).toBe("It changed since. Change it on My posts.");
    saveDrafts(UID, [draft("p1", { status: "posted" })]);
    expect(runUndo(UID, { kind: "delete-drafts", ids: ["p1"] })).toBe("It changed since. Change it on My posts.");
    expect(loadDrafts(UID)).toHaveLength(1);
  });

  it("restore-draft puts the post back while it still has the time the move wrote, and not after a move by hand", () => {
    const before = draft("m1", { status: "scheduled", scheduledFor: "2026-10-23T09:00" });
    saveDrafts(UID, [before]);
    setDraftStatus(UID, "m1", "scheduled", "2026-10-24T20:00");
    const undo = { kind: "restore-draft" as const, draft: before, was: "2026-10-24T20:00" };
    setDraftStatus(UID, "m1", "scheduled", "2026-10-25T08:00");
    expect(runUndo(UID, undo)).toBe("It changed since. Change it on Calendar.");
    expect(loadDrafts(UID)[0].scheduledFor).toBe("2026-10-25T08:00");
    setDraftStatus(UID, "m1", "scheduled", "2026-10-24T20:00");
    expect(runUndo(UID, undo)).toBe(UNDONE);
    expect(loadDrafts(UID)[0]).toEqual(before);
  });

  it("remove-competitor takes it off once, then says it changed", () => {
    const added = addCompetitor(UID, { name: "Finch", site: "finch.care", logo: null, why: "", fbPageId: null, handles: {}, adsCountry: "SG", source: "typed" });
    if (added.ok === false) throw new Error("not added");
    expect(runUndo(UID, { kind: "remove-competitor", id: added.c.id })).toBe(UNDONE);
    expect(loadCompetitors(UID).list).toEqual([]);
    expect(runUndo(UID, { kind: "remove-competitor", id: added.c.id })).toBe("It changed since. Change it on Competitors.");
    expect(removeCompetitor(UID, added.c.id)).toBeNull();
  });

  it("learning-off switches the learning off, and says it changed when it is already off", () => {
    const saved = addLearning(UID, { text: "Use an older man as my presenter", scope: "videos", source: "assistant" }, null, new Date("2026-10-22T09:00:00Z"));
    if (saved.ok === false) throw new Error("not saved");
    expect(runUndo(UID, { kind: "learning-off", id: saved.item.id })).toBe(UNDONE);
    expect(isOn(loadLearnings(UID)[0])).toBe(false);
    expect(runUndo(UID, { kind: "learning-off", id: saved.item.id })).toBe("It changed since. Change it on Your voice.");
    setLearningOff(UID, saved.item.id, false);
    full = true;
    expect(runUndo(UID, { kind: "learning-off", id: saved.item.id })).toBe("Couldn't undo that. Change it back on Your voice.");
  });

  it("delete-campaign deletes it once, then says it changed", () => {
    store.set(`content-studio-campaigns-${UID}`, JSON.stringify([{ id: "c-1", name: "Young parents, October", posts: [], angles: [], createdAt: "2026-10-22T01:00:00.000Z" }]));
    expect(runUndo(UID, { kind: "delete-campaign", id: "c-1" })).toBe(UNDONE);
    expect(loadCampaigns(UID)).toEqual([]);
    expect(runUndo(UID, { kind: "delete-campaign", id: "c-1" })).toBe("It changed since. Change it on Campaigns.");
  });

  it("a page's undo after a reload points back to the page, and a full store never throws", () => {
    expect(runUndo(UID, { kind: "page", page: "the carousel" })).toBe("Couldn't undo that. Change it back on the carousel.");
    saveDrafts(UID, [draft("f1")]);
    full = true;
    expect(runUndo(UID, { kind: "delete-drafts", ids: ["f1"] })).toBe("Couldn't undo that. Change it back on My posts.");
  });
});
