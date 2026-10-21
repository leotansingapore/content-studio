import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn(), EdgeError: class extends Error {} }));
vi.mock("@/lib/stockMedia", () => ({ searchStock: vi.fn() }));
vi.mock("@/lib/aiVideo", () => ({ aiJob: vi.fn(() => null), makeExplainer: vi.fn(async () => {}) }));
vi.mock("@/lib/draftHistory", () => ({ loadDrafts: vi.fn(() => []) }));
const as = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", () => ({ leoUser: async () => as.user }));

import { callFn } from "@/lib/edgeFn";
import { searchStock } from "@/lib/stockMedia";
import { aiJob, makeExplainer } from "@/lib/aiVideo";
import { loadDrafts } from "@/lib/draftHistory";
import type { StockItem } from "@/lib/stockMedia";
import * as explainer from "./explainer";

const UID = "user-1";
const clip = (id: string, h = 1920): StockItem => ({ id, w: 1080, h, alt: "", thumb: `https://p/${id}.jpg`, src: `https://p/${id}.mp4`, by: "", byUrl: "", url: `https://www.pexels.com/video/a-clinic-${id.charCodeAt(0)}/`, duration: 8 });
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const SCENE = { say: "Most plans have a co-pay.", picture: "A clinic waiting room in Toa Payoh", search: "clinic" };

beforeEach(() => {
  vi.stubGlobal("sessionStorage", store());
  vi.stubGlobal("localStorage", store());
  vi.mocked(callFn).mockReset();
  vi.mocked(searchStock).mockReset();
  vi.mocked(makeExplainer).mockReset();
  vi.mocked(aiJob).mockReset().mockReturnValue(null);
  as.user = null;
});

describe("the scene draft", () => {
  it("survives leaving the page and a fresh read of this tab's store, and is cleared once a video from it is made", async () => {
    explainer.saveDraft(UID, { topic: "Co-pays", scenes: [{ ...SCENE, stock: clip("a"), use: "stock" }], seconds: 60, mas: true });
    vi.resetModules();
    const fresh = await import("./explainer");
    expect(fresh.loadDraft(UID)).toEqual({ topic: "Co-pays", script: "", link: "", scenes: [{ ...SCENE, stock: clip("a"), use: "stock" }], seconds: 60, mas: true });

    // a make that stopped before the video was put together keeps the scenes
    vi.mocked(aiJob).mockReturnValue({ kind: "explainer", state: "failed", step: "", error: "No." });
    await explainer.makeNarrated(UID, { name: "Co-pays", scenes: explainer.loadDraft(UID).scenes!, voice: "eric", look: "photo", move: false, visuals: "stock" });
    expect(explainer.loadDraft(UID).scenes).toHaveLength(1);
    vi.mocked(aiJob).mockReturnValue({ kind: "explainer", state: "done", step: "" });
    await explainer.makeNarrated(UID, { name: "Co-pays", scenes: explainer.loadDraft(UID).scenes!, voice: "eric", look: "photo", move: false, visuals: "stock" });
    expect(explainer.loadDraft(UID)).toEqual({ topic: "", script: "", link: "", scenes: null, seconds: 30 });
    vi.resetModules();
    expect((await import("./explainer")).loadDraft(UID).scenes).toBeNull();
  });

  it("reads a broken store as empty", () => {
    sessionStorage.setItem(`cs-narrated-draft-${UID}`, "{not json");
    vi.resetModules();
    return import("./explainer").then((fresh) => expect(fresh.loadDraft(UID)).toEqual({ topic: "", script: "", link: "", scenes: null, seconds: 30 }));
  });
});

describe("the make", () => {
  it("sends a stock clip only for scenes that use one, and none with a look other than photo", async () => {
    const scenes = [
      { ...SCENE, stock: clip("a"), use: "stock" as const },
      { ...SCENE, stock: clip("b"), use: "ai" as const },
      { ...SCENE, stock: null, use: "ai" as const },
    ];
    await explainer.makeNarrated(UID, { name: "N", scenes, voice: "eric", look: "photo", move: true, visuals: "stock", extra: { draftId: "d1" } });
    expect(vi.mocked(makeExplainer).mock.calls[0]).toEqual(["N", scenes.map(({ say, picture }) => ({ say, picture })), "eric", { draftId: "d1" }, { look: "photo", move: true, stock: ["https://p/a.mp4", null, null] }]);
    await explainer.makeNarrated(UID, { name: "N", scenes, voice: "eric", look: "clay", move: false, visuals: "stock" });
    expect(vi.mocked(makeExplainer).mock.calls[1][4]).toEqual({ look: "clay", move: false, stock: [null, null, null] });
    await explainer.makeNarrated(UID, { name: "N", scenes, voice: "eric", look: "photo", move: false, visuals: "ai" });
    expect(vi.mocked(makeExplainer).mock.calls[2][4]?.stock).toEqual([null, null, null]);
  });

  it("says how many scenes, seconds, stock clips and AI pictures", () => {
    const s = (use: "stock" | "ai", stock: StockItem | null = clip("x")) => ({ ...SCENE, stock, use });
    expect(explainer.summaryLine([s("stock"), s("stock"), s("stock"), s("ai"), s("stock", null)], 29.6, true)).toBe("5 scenes, about 30 seconds. 3 stock clips and 2 AI pictures.");
    expect(explainer.summaryLine([s("stock"), s("stock"), s("ai")], 30, false)).toBe("3 scenes, about 30 seconds. 3 AI pictures.");
    expect(explainer.summaryLine([s("stock")], 8, true)).toBe("1 scene, about 8 seconds. 1 stock clip.");
  });
});

describe("the brand's last look", () => {
  it("keeps the look and whether it moves, per brand, and reads junk as a still photo", () => {
    const changed = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: changed });
    explainer.saveLook(UID, { look: "felt", move: true });
    expect(explainer.loadLook(UID)).toEqual({ look: "felt", move: true });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(explainer.loadLook("someone-else")).toEqual({ look: "photo", move: false });
    localStorage.setItem(`content-studio-explainer-look-${UID}`, JSON.stringify({ look: "skeleton", move: "yes" }));
    expect(explainer.loadLook(UID)).toEqual({ look: "photo", move: false });
    localStorage.setItem(`content-studio-explainer-look-${UID}`, "nope");
    expect(explainer.loadLook(UID)).toEqual({ look: "photo", move: false });
  });

  it("mixes stock only with photo", () => {
    expect(explainer.stockOn("stock", "photo")).toBe(true);
    expect(explainer.stockOn("stock", "chalk")).toBe(false);
    expect(explainer.stockOn("ai", "photo")).toBe(false);
  });
});

describe("a draft's script", () => {
  it("is only the words said: no labels, stage directions, shot notes or markdown", () => {
    const script = "**HOOK (0-3s):** Most people pay twice.\n\n[Smiles at camera]\nOn screen: a hospital bill\nBODY: The plan pays the ward.\n> CTA: Message me.";
    expect(explainer.spokenText(script)).toBe("Most people pay twice. The plan pays the ward. Message me.");
  });

  it("lists the brand's short-video drafts with their spoken script, caption left out", () => {
    vi.mocked(loadDrafts).mockReturnValue([
      { id: "d1", format: "short-video", hook: "Pay twice?", draft: "HOOK: Most people pay for hospital twice.\nCTA: Ask me how.\n---\nCAPTION: Hospital bills #health" },
      { id: "d2", format: "text-post", hook: "A post", draft: "Words words words words words." },
      { id: "d3", format: "short-video", hook: "", draft: "Too short." },
    ] as never);
    expect(explainer.scriptDrafts(UID)).toEqual([{ id: "d1", label: "Pay twice?", script: "Most people pay for hospital twice. Ask me how." }]);
  });
});

describe("finding stock clips", () => {
  const scenes = [{ say: "One", search: "clinic" }, { say: "Two", search: "hawker" }, { say: "Three", search: "hdb" }, { say: "Four", search: "beach" }];

  it("takes Jev's pick per scene, an AI picture where none fits, the first clip with no answer, and never a clip twice", async () => {
    vi.mocked(searchStock).mockImplementation(async (_k, q) => {
      if (q === "hdb") throw new Error("cap");
      return { items: q === "beach" ? [clip("a"), clip("c")] : [clip("a"), clip("b"), clip("w", 400)], more: false };
    });
    vi.mocked(callFn).mockResolvedValue({ picks: [1, -1, null, null] });
    const steps: number[] = [];
    const got = await explainer.findStock(scenes, "Co-pays", (d) => steps.push(d));
    expect(got.map((c) => c?.id ?? null)).toEqual(["b", null, null, "a"]);
    expect(steps).toEqual([1, 2, 3, 4]);
    // a landscape clip is never offered, and one montage-pick call covers every scene
    const [fn, body] = vi.mocked(callFn).mock.calls[0];
    expect(fn).toBe("video-assist");
    expect(body).toMatchObject({ mode: "montage-pick", theme: "Co-pays", beats: [{ say: "One", candidates: [{ desc: "a clinic" }, { desc: "a clinic" }] }, { say: "Two" }, { say: "Three", candidates: [] }, { say: "Four" }] });
    expect(vi.mocked(callFn)).toHaveBeenCalledTimes(1);
  });

  it("asks Jev nothing when no scene found a clip", async () => {
    vi.mocked(searchStock).mockResolvedValue({ items: [], more: false });
    expect(await explainer.findStock(scenes.slice(0, 2), "x", () => {})).toEqual([null, null]);
    expect(callFn).not.toHaveBeenCalled();
  });
});

describe("the write", () => {
  const written = { scenes: [SCENE, { ...SCENE, search: "hawker" }, { ...SCENE, search: "hdb" }], look: { id: "chalk", p: 0.5 }, mas: false };

  it("reads a link first, writes from the page, then finds stock, and keeps it all in the draft", async () => {
    explainer.saveDraft(UID, { link: " https://www.moneysense.gov.sg/a " });
    vi.mocked(searchStock).mockResolvedValue({ items: [clip("a")], more: false });
    vi.mocked(callFn).mockImplementation(async (fn, body) => {
      const mode = (body as { mode: string }).mode;
      if (mode === "read") return { title: "Co-pays explained", site: "MoneySense", text: "Page words" };
      if (mode === "script") return written;
      return { picks: [0, -1, null] };
    });
    const steps: string[] = [];
    const off = explainer.onNarratedWrite((w) => w?.step && steps.push(w.step));
    await explainer.writeNarrated(UID, { from: "link", seconds: 60, stock: true });
    off();
    expect(vi.mocked(callFn).mock.calls.map(([, b]) => b)).toEqual([
      { mode: "read", url: "https://www.moneysense.gov.sg/a" },
      { mode: "script", topic: "", seconds: 60, source: { kind: "link", title: "Co-pays explained", text: "Page words" } },
      expect.objectContaining({ mode: "montage-pick", theme: "Co-pays explained" }),
    ]);
    expect(steps.slice(0, 3)).toEqual(["Reading the page...", "Writing the script...", "Finding stock clips, 0 of 3..."]);
    const d = explainer.loadDraft(UID);
    expect(d.scenes?.map((s) => [s.stock?.id ?? null, s.use])).toEqual([["a", "stock"], [null, "ai"], [null, "ai"]]);
    expect(d).toMatchObject({ seconds: 60, source: { url: "https://www.moneysense.gov.sg/a", site: "MoneySense", title: "Co-pays explained" }, recommended: { id: "chalk", p: 0.5 }, mas: false, found: true });
    expect(explainer.narratedWrite()).toEqual({ state: "done", step: "" });
  });

  it("splits a pasted script as a script source with no stock search for AI only, and a refusal keeps the scenes there were", async () => {
    explainer.saveDraft(UID, { script: "  My own words, said exactly as I wrote them here today.  ", scenes: [{ ...SCENE, stock: null, use: "ai" }] });
    vi.mocked(callFn).mockRejectedValueOnce(new Error("Couldn't split your script without changing it. Try again."));
    await explainer.writeNarrated(UID, { from: "script", seconds: 30, stock: false });
    expect(explainer.narratedWrite()).toMatchObject({ state: "failed", error: "Couldn't split your script without changing it. Try again." });
    expect(explainer.loadDraft(UID).scenes).toHaveLength(1);

    vi.mocked(callFn).mockResolvedValueOnce(written);
    await explainer.writeNarrated(UID, { from: "script", seconds: 30, stock: false });
    expect(vi.mocked(callFn).mock.calls.at(-1)?.[1]).toEqual({ mode: "script", topic: "", seconds: 30, source: { kind: "script", text: "My own words, said exactly as I wrote them here today." } });
    expect(searchStock).not.toHaveBeenCalled();
    expect(explainer.loadDraft(UID)).toMatchObject({ found: false, scenes: [{ use: "ai", stock: null }, { use: "ai" }, { use: "ai" }] });
  });
});

describe("Leo's standing notes in the narrated script", () => {
  it("go with his script request, a video learning and not a post one, and nobody else's", async () => {
    localStorage.setItem(
      `content-studio-learnings-${UID}`,
      JSON.stringify([
        { id: "l1", text: "Use Asian presenters", scope: "videos", source: "assistant", createdAt: "2026-10-19T03:00:00.000Z" },
        { id: "l2", text: "Never use emoji", scope: "posts", source: "assistant", createdAt: "2026-10-19T04:00:00.000Z" },
      ]),
    );
    explainer.saveDraft(UID, { topic: "Why co-pays", scenes: [] });
    vi.mocked(callFn).mockResolvedValue({ scenes: [SCENE, SCENE, SCENE], look: null, mas: null });
    await explainer.writeNarrated(UID, { from: "topic", seconds: 30, stock: false });
    expect(vi.mocked(callFn).mock.calls.at(-1)?.[1]).toEqual({ mode: "script", topic: "Why co-pays", seconds: 30 });
    as.user = { id: UID, email: "leo@example.com" };
    await explainer.writeNarrated(UID, { from: "topic", seconds: 30, stock: false });
    expect(vi.mocked(callFn).mock.calls.at(-1)?.[1]).toEqual({
      mode: "script",
      topic: "Why co-pays",
      seconds: 30,
      notes: "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n- Keep doing or avoid: Use Asian presenters",
    });
  });
});
