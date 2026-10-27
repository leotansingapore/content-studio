import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ speaker: "person" as "person" | "business" }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
vi.mock("@/lib/remixBrand", async (orig) => ({ ...(await orig<typeof import("./remixBrand")>()), speakerFor: () => who.speaker }));

import { LINES, approveLabel, blockedReason, competitorCard, flagsFor, makeCard, offerChips, topicOf, whoFor, withInput, withScript, type MakeAsk } from "@/lib/agentPlans";
import { estimateScript, newCardId, type AgentCard } from "@/lib/agentCards";
import { needsOf } from "@/lib/agentBudget";
import { LOOKS } from "@/lib/aiVideo";
import { priceOf, sumPrices, WRITE_PRICE } from "@/lib/prices";
import { addLearning } from "@/lib/voiceMemory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const ask = (o: Partial<MakeAsk>): MakeAsk => ({ plan: "post", format: "post", act: "make", p: {}, topic: "CPF LIFE for young parents", ...o });
const today = () => new Date().toISOString().slice(0, 10);
const plain = (plan: string, extra: Partial<AgentCard> = {}): AgentCard => ({ id: newCardId(), kind: "make", title: "", line: "", needs: [], plan: { plan, act: "make", p: {} }, status: "proposed", proposedAt: "", ...extra });

beforeEach(() => {
  store.clear();
  who.speaker = "person";
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", localStorage);
});
afterEach(() => vi.unstubAllGlobals());

describe("first cards are priced from the price table, never typed", () => {
  it("each make's price and uses", () => {
    expect(makeCard(UID, ask({})).price).toEqual(priceOf("remix-make"));
    expect(makeCard(UID, ask({ plan: "slideshow", format: "slideshow" })).needs).toEqual(needsOf("slideshow"));
    const link = makeCard(UID, ask({ plan: "link", format: "carousel", link: "https://example.com/a" }));
    expect([link.title, link.price, link.needs]).toEqual(["Remix this link into a carousel", sumPrices(priceOf("remix-link"), priceOf("remix-make")), needsOf("link")]);
    const ex = makeCard(UID, ask({ plan: "explainer", format: "explainer" }));
    expect([ex.step, ex.price]).toEqual(["script", priceOf("ai-video-script")]);
    const pic = makeCard(UID, ask({ plan: "image", format: "image", topic: "A family at a hawker centre on a Sunday morning, warm light" }));
    expect([pic.title, pic.price, pic.prompt]).toEqual(["Picture: A family at a hawker centre on a Sunday", priceOf("ai-image"), "A family at a hawker centre on a Sunday morning, warm light"]);
  });

  it("a talking video's first card writes the script only; its video card prices the script with talkPrice's estimate", () => {
    const c = makeCard(UID, ask({ plan: "speaking", format: "speaking", length: 20 }));
    expect([c.kind, c.step, c.price, c.needs.map((n) => n.feature)]).toEqual(["video", "script", priceOf("remix-make"), needsOf("speaking", { write: true, presenter: true }).map((n) => n.feature)]);
    const words = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    const v = withScript(UID, c, words);
    expect([v.step, v.price, v.credits]).toEqual(["video", estimateScript(40, { presenter: true }).price, 44]);
    expect(v.needs).toEqual(needsOf("speaking", { write: false, presenter: true }));
  });

  it("who appears: a saved pick, else a new Singaporean presenter from LOOKS, never a face from anywhere else", () => {
    expect(whoFor(UID, { id: "new", look: LOOKS[4] })).toEqual({ who: "presenter", look: LOOKS[4] });
    expect(whoFor(UID, { id: "new", look: "a face from a link" }).look).not.toBe("a face from a link");
    const fallback = whoFor(UID, { id: "mine", look: "" }); // no face saved
    expect(fallback.who).toBe("presenter");
    expect(LOOKS).toContain(fallback.look);
  });
});

describe("approveLabel", () => {
  it("names each plan's press", () => {
    const labels = ["post", "link", "image", "competitor", "move", "write", "paste", "campaign", "learning", "answer"].map((plan) => approveLabel(plain(plan, plan === "move" ? { title: 'Move "X"' } : {})));
    expect(labels).toEqual(["Make it", "Remix this link into a post", "Approve and make", "Add them", "Move it", "Open in Write", "Paste it", "Add and write", "Remember", "Write 3 angles"]);
    expect(approveLabel(plain("edit", { step: "write" }))).toBe("Write the change");
    expect(approveLabel(plain("edit", { step: "apply" }))).toBe("Use this");
    expect(approveLabel(plain("speaking", { step: "video", price: { usd: 3.31, kind: "about" }, plan: { plan: "speaking", act: "make", p: {}, priced: true } }))).toBe("Make it for US$3.31");
    expect(WRITE_PRICE).toEqual({ usd: 0.01, kind: "about" });
  });
});

describe("the competitor card's box", () => {
  it("a handle adds with no read and no price; a name is read and priced; nothing parseable blocks Approve", () => {
    const base = plain("competitor", { kind: "competitor" });
    expect(withInput(base, "@finchcare")).toMatchObject({ title: "Add finchcare as a competitor", line: "@finchcare", needs: [], price: undefined });
    expect(withInput(base, "Finch")).toMatchObject({ title: "Add Finch as a competitor", price: priceOf("competitor-read"), needs: needsOf("competitor") });
    const empty = withInput(base, " ");
    expect(empty.title).toBe("Add a competitor");
    expect(blockedReason(UID, empty, null)).toBe(LINES.typeCompetitor);
  });
});

describe("a competitor already watched", () => {
  it("is named from the list, a name a page read may have written, so the line is flagged as quoting outside text", () => {
    const owl = { id: "owl-ab12", name: "Owl Planners", site: "owl.sg", logo: null, why: "", fbPageId: null, handles: {}, adsCountry: "SG", source: "suggested", addedAt: "2026-10-01T00:00:00Z" };
    store.set(`content-studio-competitors-${UID}`, JSON.stringify({ list: [owl], dismissed: [] }));
    expect(competitorCard(UID, "add https://owl.sg as a competitor", "competitor", {})).toMatchObject({ text: "You already watch Owl Planners.", quotes: true });
  });
});

describe("blockedReason", () => {
  it("names what is used up, and the learnings cap", () => {
    const video = withScript(UID, makeCard(UID, ask({ plan: "speaking", format: "speaking" })), Array.from({ length: 40 }, () => "word").join(" "));
    const usage = { day: today(), used: { "ai-video": 2 } };
    expect(blockedReason(UID, { ...video, status: "proposed" }, usage)).toBe("No AI videos left today. Back at 8am Singapore time.");
    expect(blockedReason(UID, { ...video, status: "proposed" }, { day: today(), used: { "ai-voice": 10 } })).toBe("No voiceovers left today. Back at 8am Singapore time.");
    expect(blockedReason(UID, { ...video, status: "proposed" }, null)).toBeNull();
    for (let i = 0; i < 30; i++) addLearning(UID, { text: `note ${i}`, scope: "posts", source: "typed" });
    expect(blockedReason(UID, plain("learning"), null)).toBe("30 is the most. Remove one on Your voice to add another.");
    expect(blockedReason(UID, plain("learning", { plan: { plan: "learning", act: "remember", p: {}, replaces: "l-1" } }), null)).toBeNull();
  });
});

describe("cheaper offers", () => {
  it("ask again here as a message, or open Write with the topic", () => {
    expect(offerChips("speaking", null, "CPF LIFE")).toEqual([
      { label: "Make the picture post", path: "say:Make a picture post about CPF LIFE" },
      { label: "Write the script", path: "say:Write a script about CPF LIFE" },
    ]);
    expect(offerChips("carousel", null, "CPF LIFE")).toEqual([{ label: "Write it in Write", path: "/generate?detail=CPF+LIFE&format=carousel" }]);
  });
});

describe("flags and topics", () => {
  it("warn a person's brand from Jev's MAS answer, else the compliance words; a business gets none", () => {
    expect(flagsFor(UID, "It's guaranteed.", null)).toEqual(['Check: "guaranteed" is flagged.']);
    expect(flagsFor(UID, "It's guaranteed.", false)).toEqual([]);
    expect(flagsFor(UID, "Fine words.", true)).toEqual(["Check: this may need a compliance review before it goes out."]);
    who.speaker = "business";
    expect(flagsFor(UID, "It's guaranteed.", true)).toEqual([]);
  });
  it("a topic is one line of 200 at most, cut at a word", () => {
    const t = topicOf(`${"word ".repeat(60)}\n end`);
    expect(t.length).toBeLessThanOrEqual(200);
    expect(t.endsWith("word")).toBe(true);
    expect(topicOf("  make a\ncarousel ")).toBe("make a carousel");
  });
});
