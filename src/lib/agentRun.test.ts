import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AgentP as ServerP, AgentPick as ServerPick } from "../../supabase/functions/assistant-act/logic.ts";

// Every maker is faked: each paid start is logged in fake.calls, so a test can prove nothing priced starts before
// its card's press. assistant-act (Jev) and writing-judge's conflict check are the only functions a message may call.
const fake = vi.hoisted(() => {
  type L = (j: any) => void;
  const store = () => {
    let j: any = null;
    const ls = new Set<L>();
    return {
      get: () => j,
      set: (n: any) => {
        j = n;
        for (const l of [...ls]) l(n && { ...n });
      },
      on: (fn: L) => {
        ls.add(fn);
        return () => void ls.delete(fn);
      },
      reset: () => {
        j = null;
        ls.clear();
      },
    };
  };
  return {
    calls: [] as string[],
    usage: null as null | { day: string; used: Record<string, number> },
    speaker: "person" as "person" | "business",
    sources: {} as Record<string, unknown>,
    talkEnd: "done" as "done" | "priced",
    talkAsk: null as null | { quoted?: number; voice?: string; caption?: string; agent?: unknown },
    scriptAsk: null as null | { as: string; seconds?: number; words?: number },
    imageAgent: undefined as unknown,
    remixFails: false,
    remix: store(),
    show: store(),
    wall: store(),
    talk: store(),
    ai: store(),
    image: store(),
    link: store(),
  };
});
const jev = vi.hoisted(() => ({ pick: null as unknown, p: {} as Record<string, number | null>, refuse: null as null | { status: number; code: string }, hang: false, bodies: [] as Record<string, unknown>[] }));
const invoke = vi.hoisted(() => vi.fn());
const wait = () => new Promise((r) => setTimeout(r, 0));
const SCRIPT =
  "Most people never check what CPF LIFE will pay them. Here's where to see your own estimate in two minutes. Log in, open the payout page, and pick the plan that fits how you want to live after sixty five.";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
vi.mock("@/lib/aiUsage", async (orig) => ({ ...(await orig<typeof import("./aiUsage")>()), readUsage: async () => fake.usage }));
vi.mock("@/lib/remixBrand", async (orig) => ({ ...(await orig<typeof import("./remixBrand")>()), speakerFor: () => fake.speaker }));
vi.mock("@/lib/resolveSource", () => ({ resolveSource: (key: string) => fake.sources[key] ?? null }));
vi.mock("@/lib/remixJob", async (orig) => ({
  ...(await orig<typeof import("./remixJob")>()),
  remixJob: () => fake.remix.get(),
  onRemixJob: (fn: (j: unknown) => void) => fake.remix.on(fn),
  startRemix: (userId: string, run: { as: string[]; agent?: unknown; topic?: string }) => {
    fake.calls.push(`startRemix:${run.as[0]}`);
    const job = { id: 7, key: "", state: "working", step: "Writing", rows: [{ as: run.as[0], state: "working" }], run: {} };
    fake.remix.set(job);
    void import("./draftHistory").then(async (m) => {
      await new Promise((r) => setTimeout(r, 0));
      if (fake.remixFails) return fake.remix.set({ ...job, state: "failed", rows: [{ as: run.as[0], state: "failed", error: "No remixes left today. They reset at 8am Singapore time.", refunded: true }] });
      m.upsertDraft(userId, { id: "d-made", createdAt: "2026-10-22T00:00:00.000Z", hook: "CPF LIFE pays for life", draft: "CPF LIFE pays for life. It is guaranteed.", pillar: "topic", pillarDetail: "", audience: "general", format: "carousel", platform: "instagram", ctaType: "save-share", agent: run.agent as { thread: string; msg: string } });
      fake.remix.set({ ...job, state: "done", rows: [{ as: run.as[0], state: "done", draftId: "d-made", hook: "CPF LIFE pays for life", href: "/carousel?draft=d-made", flags: { copied: [], claim: false, invented: false } }] });
    });
  },
}));
// the talking video's script: one remix make, written to the words its length takes in the card's voice
vi.mock("@/lib/remix", async (orig) => ({
  ...(await orig<typeof import("./remix")>()),
  requestMake: async (body: { as: string; seconds?: number; words?: number }) => {
    fake.calls.push("writeScript");
    fake.scriptAsk = body;
    await wait();
    return { result: { as: "speaking", script: SCRIPT, caption: "Check your own payout tonight. Save this for later." }, flags: { copied: [], claim: false, invented: false } };
  },
}));
vi.mock("@/lib/slideshowJob", async (orig) => ({
  ...(await orig<typeof import("./slideshowJob")>()),
  slideshowJob: () => fake.show.get(),
  slideshowBusy: () => ["writing", "finding", "drawing"].includes(fake.show.get()?.state),
  onSlideshowJob: (fn: (j: unknown) => void) => fake.show.on(fn),
  startSlideshow: async (_u: string, ask: { pictures: string }) => {
    fake.calls.push(`startSlideshow:${ask.pictures}`);
    fake.show.set({ id: 1, state: "writing", done: 0, of: 0, ask });
    await wait();
    fake.show.set({ id: 1, state: "done", done: 5, of: 5, ask, showId: "show1" });
  },
}));
vi.mock("@/lib/wallJob", async (orig) => ({
  ...(await orig<typeof import("./wallJob")>()),
  wallJob: () => fake.wall.get(),
  wallBusy: () => ["writing", "finding", "clip", "joining"].includes(fake.wall.get()?.state),
  onWallJob: (fn: (j: unknown) => void) => fake.wall.on(fn),
  startWall: async (_u: string, ask: unknown) => {
    fake.calls.push("startWall");
    fake.wall.set({ id: 1, state: "writing", ask });
    await wait();
    fake.wall.set({ id: 1, state: "done", ask, written: { text: "Your CPF is not a savings account.", caption: "", scene: "", search: "", flags: { copied: [], claim: false, invented: false, mas: null } } });
  },
}));
vi.mock("@/lib/talkingHeadJob", async (orig) => ({
  ...(await orig<typeof import("./talkingHeadJob")>()),
  talkJob: () => fake.talk.get(),
  talkBusy: () => ["writing", "presenter", "voice", "video", "joining"].includes(fake.talk.get()?.state),
  onTalkJob: (fn: (j: unknown) => void) => fake.talk.on(fn),
  madePresenter: () => null,
  resumeTalk: () => false,
  writeTalk: async () => {
    fake.calls.push("writeTalk");
    fake.talk.set({ id: 1, state: "writing", step: "Writing your script...", params: {} });
    await wait();
    fake.talk.set({ id: 1, state: "written", step: "", params: {}, script: SCRIPT, flags: { copied: [], claim: false, invented: false } });
  },
  startTalk: async (_u: string, a: { who: string; text: string; quoted?: number; voice?: string; caption?: string }) => {
    fake.calls.push(`startTalk:${a.who}`);
    fake.talkAsk = a;
    fake.talk.set({ id: 2, state: "voice", step: "Making the voiceover...", params: {}, script: a.text });
    await wait();
    const voice = { pcm: new Float32Array(), seconds: 18, slices: [{ start: 0, end: 9.5 }, { start: 9.5, end: 18 }] };
    fake.talk.set(fake.talkEnd === "priced" ? { id: 2, state: "priced", step: "", params: {}, script: a.text, voice, real: { seconds: 18, price: { usd: 3.31, kind: "about" } } } : { id: 2, state: "done", step: "", params: {}, script: a.text, voice });
  },
  goOnAtPrice: async () => {
    fake.calls.push("goOnAtPrice");
    fake.talk.set({ ...fake.talk.get(), state: "done" });
  },
}));
vi.mock("@/lib/aiVideo", async (orig) => ({
  ...(await orig<typeof import("./aiVideo")>()),
  aiBusy: () => fake.ai.get()?.state === "working",
  aiJob: () => fake.ai.get(),
  onAiJob: (fn: (j: unknown) => void) => fake.ai.on(fn),
  pendingExplainer: () => null,
  resumeExplainer: () => {},
  writeExplainer: async () => {
    fake.calls.push("writeExplainer");
    return [1, 2, 3, 4, 5].map((n) => ({ say: `Scene ${n} says a short line about CPF LIFE payouts.`, picture: "a park" }));
  },
  makeExplainer: async () => {
    fake.calls.push("makeExplainer");
    fake.ai.set({ kind: "explainer", state: "working", step: "Making the voiceover..." });
    await wait();
    fake.ai.set({ kind: "explainer", state: "done", step: "" });
  },
}));
vi.mock("@/lib/aiImage", async (orig) => ({
  ...(await orig<typeof import("./aiImage")>()),
  imageJob: () => fake.image.get(),
  imageBusy: () => ["working", "saving"].includes(fake.image.get()?.state),
  onImageJob: (fn: (j: unknown) => void) => fake.image.on(fn),
  resumeImage: () => {},
  makeImage: async (_u: string, prompt: string, _name: string, _design?: string, agent?: unknown) => {
    fake.calls.push("makeImage");
    fake.imageAgent = agent;
    fake.image.set({ prompt, state: "working" });
    await wait();
    fake.image.set({ prompt, state: "done" });
  },
}));
vi.mock("@/lib/remixLink", async (orig) => ({
  ...(await orig<typeof import("./remixLink")>()),
  linkRead: () => fake.link.get(),
  startLinkRead: async (_u: string, input: unknown) => {
    fake.calls.push("startLinkRead");
    fake.sources["link:web:abc"] = { key: "link:web:abc", kind: "link", format: "text", platform: "web", title: "Why CPF LIFE matters", author: "someone", url: "https://example.com/a", text: "" };
    fake.link.set({ id: 1, state: "done", step: "", startedAt: 0, input, key: "link:web:abc" });
  },
}));
vi.mock("@/lib/competitors", async (orig) => ({ ...(await orig<typeof import("./competitors")>()), runRead: async () => void fake.calls.push("runRead") }));
vi.mock("@/lib/campaignJob", async (orig) => ({ ...(await orig<typeof import("./campaignJob")>()), startDrafting: () => void fake.calls.push("startDrafting") }));

import { CAPABILITIES, CAP_LINE, INTERRUPTED, NOT_MADE, REFUSE, STOPPED, agentNow, choose, clientPick, editCard, onAgent, press, resumeAgent, send, setFeedback, setNavigate, setSkills, stop, turnOf, undoReceipt, waitingCards, type SkillsApi } from "@/lib/agentRun";
import { approveLabel, fieldsOf, LINES } from "@/lib/agentPlans";
import { starterChips } from "@/lib/agentStarters";
import { loadThreads, newMsg, newThread, type AgentMsg } from "@/lib/agentThreads";
import { UNDONE, estimateScript, type AgentPick } from "@/lib/agentCards";
import { loadActivity, setActivityOn } from "@/lib/activity";
import { confirmAngles } from "@/lib/angles";
import { saveAudience } from "@/lib/audiences";
import { loadShadow, saveAutonomy } from "@/lib/autonomy";
import { campaignCost, loadCampaigns } from "@/lib/campaigns";
import { loadCompetitors } from "@/lib/competitors";
import { loadDrafts, saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { registerEditTarget } from "@/lib/editTarget";
import { priceOf, priceText, type Price } from "@/lib/prices";
import { activeLearnings, loadLearnings } from "@/lib/voiceMemory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const PRICED = /^(startRemix|startSlideshow|startWall|writeTalk|writeScript|startTalk|goOnAtPrice|writeExplainer|makeExplainer|makeImage|startLinkRead|runRead|startDrafting|propose|apply|runSkill|navigate|fn:(?!assistant-act$|writing-judge$))/;
const priced = () => fake.calls.filter((c) => PRICED.test(c));
const pk = (o: Partial<ServerPick>): ServerPick => ({ act: null, format: null, length: null, who: null, audience: null, weeks: null, pace: null, slide: null, which: null, skill: null, post: null, day: null, time: null, scope: null, subject: null, name: null, ...o });
const thread = (id: string) => loadThreads(UID).find((t) => t.id === id)!;
const last = (id: string): AgentMsg => thread(id).messages[thread(id).messages.length - 1];
const cardMsg = (id: string): AgentMsg => [...thread(id).messages].reverse().find((m) => m.card)!;
const settled = (id: string) => vi.waitFor(() => expect(["starting", "thinking", "writing", "making"]).not.toContain(turnOf(id)?.state), { timeout: 2000, interval: 2 });
/** Sends a message with Jev answering `pick`, and waits for the turn to end. */
async function say(text: string, pick: Partial<ServerPick> | null, o: { thread?: string; chip?: "post" | "carousel" | "video" | "campaign"; source?: string; p?: Record<string, number | null> } = {}) {
  jev.pick = pick && pk(pick);
  jev.p = o.p ?? { act: 0.9 };
  const id = send(UID, o.thread ?? null, text, { chip: o.chip, source: o.source });
  await settled(id);
  return id;
}
async function approve(id: string, msg = cardMsg(id).id) {
  fake.calls.push("PRESS");
  await press(UID, id, msg, "approve");
  await settled(id);
}
/** Every priced call came after the last press, and at least one did. */
function pricedAfterPress() {
  const at = fake.calls.lastIndexOf("PRESS");
  expect(at).toBeGreaterThanOrEqual(0);
  const before = fake.calls.slice(0, at).filter((c) => PRICED.test(c));
  expect(before).toEqual([]);
  expect(fake.calls.slice(at).some((c) => PRICED.test(c))).toBe(true);
}
const post = (extra: Partial<DraftEntry> = {}): DraftEntry => ({ id: "p1", createdAt: "2026-10-01T00:00:00.000Z", hook: "Three CPF myths", draft: "Myth one...", pillar: "topic", pillarDetail: "", audience: "general", format: "text-post", platform: "linkedin", ctaType: "dm-keyword", ...extra });

beforeEach(() => {
  store.clear();
  fake.calls.length = 0;
  fake.usage = null;
  fake.speaker = "person";
  fake.sources = {};
  fake.talkEnd = "done";
  fake.remixFails = false;
  for (const s of [fake.remix, fake.show, fake.wall, fake.talk, fake.ai, fake.image, fake.link]) s.reset();
  jev.pick = null;
  jev.p = {};
  jev.refuse = null;
  jev.hang = false;
  jev.bodies = [];
  invoke.mockReset();
  invoke.mockImplementation(async (name: string, opts: { body: Record<string, unknown>; signal?: AbortSignal }) => {
    fake.calls.push(`fn:${name}`);
    if (name === "writing-judge") return { data: { replaces: null }, error: null };
    if (name !== "assistant-act") return { data: null, error: new Error(`unexpected ${name}`) };
    jev.bodies.push(opts.body);
    if (jev.hang) return new Promise((resolve) => opts.signal?.addEventListener("abort", () => resolve({ data: null, error: new Error("aborted") })));
    if (jev.refuse) return { data: null, error: { context: new Response(JSON.stringify({ code: jev.refuse.code, error: "You've used all 100 for today." }), { status: jev.refuse.status }) } };
    return { data: { pick: jev.pick, p: jev.p }, error: null };
  });
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("localStorage", localStorage);
  setSkills(null);
  setFeedback(null);
  setNavigate(null);
  setActivityOn(true);
  resumeAgent(UID, () => Date.now());
});
afterEach(() => {
  setActivityOn(false);
  vi.unstubAllGlobals();
});

describe("the server's pick and agentCards' pick", () => {
  it("have the same slots, and clientPick reads indexes as the ids sent", () => {
    expectTypeOf<keyof ServerPick>().toEqualTypeOf<keyof AgentPick>();
    expectTypeOf<ServerPick["format"]>().toEqualTypeOf<AgentPick["format"]>();
    expectTypeOf<keyof ServerP>().toEqualTypeOf<keyof ServerPick>();
    const sent = { speakers: [{ id: "mine", look: "me" }, { id: "pr-abc", look: "x" }], audiences: [{ id: "au-1", name: "Parents" }], skills: [{ id: "s1", slash: "tighten", name: "Tighten", instruction: "Tighten it" }] };
    expect(clientPick(pk({ act: "make", who: 1, audience: 0, slide: 2, which: 3, skill: 0 }), sent)).toMatchObject({ act: "make", who: "pr-abc", audience: "au-1", slide: 3, which: "l4", skill: "tighten" });
    expect(clientPick(pk({ act: "forget", which: "last" }), sent)?.which).toBe("last");
    expect(clientPick(pk({}), sent)).toBeNull();
  });
});

describe("a turn", () => {
  it("writes the user row and Starting before send returns, then thinks, then answers with its steps and time", async () => {
    let seen: string[] = [];
    const off = onAgent(() => (seen = [...seen, turnOf(loadThreads(UID)[0]?.id ?? "")?.state ?? ""]));
    jev.pick = pk({ act: "capabilities" });
    const id = send(UID, null, "what can you do");
    expect(thread(id).title).toBe("what can you do");
    // the agent's row is written before send returns, and is already thinking by then
    expect(thread(id).messages.map((m) => [m.role, m.text ?? m.turn])).toEqual([["user", "what can you do"], ["agent", expect.stringMatching(/^(starting|thinking)$/)]]);
    await settled(id);
    off();
    expect(seen).toContain("thinking");
    expect(last(id)).toMatchObject({ text: CAPABILITIES, turn: "done", meta: { steps: 1 } });
    expect(last(id).go?.map((g) => g.label)).toEqual(["Open Swipe file", "Open My posts"]);
  });

  it("sends agent mode's fields and only the one proposed card as pending", async () => {
    const id = await say("make a carousel about CPF LIFE", { act: "make", format: "carousel" });
    expect(jev.bodies[0]).toMatchObject({ agent: true, speaker: "person", pending: "", learnings: [], lastChange: "", competitorAds: false });
    expect((jev.bodies[0].speakers as unknown[]).length).toBe(6); // no face, no presenters: the six Singaporean looks
    await say("yes go ahead", null, { thread: id });
    expect(jev.bodies[1].pending).toBe('Carousel: "make a carousel about CPF LIFE"');
    await say("make a post about CPF", { act: "make", format: "post" }, { thread: id });
    await say("go ahead", null, { thread: id });
    expect(jev.bodies[3].pending).toBe(""); // two proposed: a yes is a new request
  });

  it("stops before Jev answers: nothing after it is called and the turn says so", async () => {
    jev.hang = true;
    const id = send(UID, null, "make a carousel about CPF LIFE");
    await vi.waitFor(() => expect(turnOf(id)?.state).toBe("thinking"), { interval: 2 });
    stop(id);
    await settled(id);
    expect(last(id)).toMatchObject({ text: STOPPED, turn: "stopped" });
    expect(priced()).toEqual([]);
    expect(last(id).card).toBeUndefined();
  });

  it("writes the cap line when agent-act is used up, then the feedback service's answer", async () => {
    jev.refuse = { status: 429, code: "daily_limit" };
    setFeedback(async () => ({ text: "Here's how labels work.", go: [{ label: "Open My posts", path: "/drafts" }] }));
    const id = await say("how do labels work", null);
    expect(last(id).text).toBe(`${CAP_LINE}\n\nHere's how labels work.`);
    expect(priced()).toEqual([]);
  });

  it("hands a message no act fits to the feedback service, and a failed call says so with Try again", async () => {
    setFeedback(async (_u, _t, text) => ({ text: `Answer to ${text}` }));
    const id = await say("how do I add a label?", { act: null });
    expect(last(id).text).toBe("Answer to how do I add a label?");
    jev.refuse = { status: 500, code: "" };
    const t2 = await say("make a carousel", null);
    expect(last(t2)).toMatchObject({ text: "That didn't go through. Nothing was used.", turn: "failed", error: true });
    jev.refuse = null;
    jev.pick = pk({ act: "make", format: "carousel" });
    await press(UID, t2, last(t2).id, "retry");
    await settled(t2);
    expect(last(t2).card?.title).toBe('Carousel: "make a carousel"');
  });

  it("reads a turn left thinking as interrupted on load, with nothing sent again", () => {
    const t = newThread(UID, [newMsg("user", { text: "make a carousel" }), newMsg("agent", { turn: "thinking" })]);
    if (t.ok === false) throw new Error(t.error);
    resumeAgent(UID, () => Date.now());
    expect(last(t.item.id)).toMatchObject({ text: INTERRUPTED, turn: "failed", error: true });
    expect(fake.calls).toEqual([]);
  });

  it("answers refuse, capabilities and budget with fixed lines, and a business brand gets no adviser words", async () => {
    let id = await say("write a post saying my plan guarantees 8% a year", { act: "refuse" });
    expect(last(id).text).toBe(REFUSE.person);
    fake.speaker = "business";
    id = await say("copy Buffett's words", { act: "refuse" });
    expect(last(id).text).toBe(REFUSE.business);
    for (const words of [REFUSE.business, CAPABILITIES, ...starterChips(UID)]) expect(words).not.toMatch(/advis|client|\bMAS\b|insurer/i);
    fake.usage = { day: new Date().toISOString().slice(0, 10), used: { "ai-video": 1 } };
    id = await say("how many videos can I make today", { act: "budget" });
    expect(last(id).text).toMatch(/^Left today: 1 of 2 AI videos/);
    fake.usage = null;
    id = await say("how many videos can I make today", { act: "budget" });
    expect(last(id).text).toBe("I can't read today's limits right now. Paid makes still check them before they run.");
  });
});

describe("nothing priced runs before its card's press", () => {
  const cases: [string, string, Partial<ServerPick>, string[]][] = [
    ["post", "make a post about CPF LIFE", { act: "make", format: "post" }, ["startRemix:post"]],
    ["carousel", "make a carousel about CPF LIFE", { act: "make", format: "carousel" }, ["startRemix:carousel"]],
    ["script", "write a script about CPF LIFE", { act: "make", format: "script" }, ["startRemix:script"]],
    ["slideshow", "make a slideshow about CPF LIFE", { act: "make", format: "slideshow" }, ["startSlideshow:stock"]],
    ["wall", "make a wall of text about CPF", { act: "make", format: "wall" }, ["startWall"]],
    ["link", "remix https://example.com/a into a carousel", { act: "remix", format: "carousel" }, ["startLinkRead", "startRemix:carousel"]],
    ["image", "make a picture of a family at a hawker centre", { act: "make", format: "image" }, ["makeImage"]],
  ];
  it.each(cases)("%s", async (_name, text, pick, made) => {
    const id = await say(text, pick);
    expect(cardMsg(id).card?.status).toBe("proposed");
    expect(priced()).toEqual([]);
    await approve(id);
    pricedAfterPress();
    expect(priced()).toEqual(made);
    expect(cardMsg(id).receipt?.title).toMatch(/written|made/);
  });

  it("a remix lands as a MADE block and a receipt whose Undo deletes the draft; a refusal by the server fails with cheaper chips", async () => {
    const id = await say("make a carousel about CPF LIFE", { act: "make", format: "carousel" });
    expect(cardMsg(id).card?.price).toEqual(priceOf("remix-make"));
    expect(approveLabel(cardMsg(id).card!)).toBe("Make it");
    await approve(id);
    const m = cardMsg(id);
    expect(m.job).toMatchObject({ kind: "remix", state: "done", drafts: ["d-made"], open: "/carousel?draft=d-made" });
    expect(m.receipt).toMatchObject({ title: "Carousel written", line: "CPF LIFE pays for life. It's in My posts.", undo: { kind: "delete-drafts", ids: ["d-made"] } });
    expect(m.card?.flags).toEqual(['Check: "guaranteed" is flagged.']);
    expect(loadDrafts(UID)[0].agent).toEqual({ thread: id, msg: m.id });
    expect(await undoReceipt(UID, id, m.id)).toBe(UNDONE);
    expect(loadDrafts(UID)).toEqual([]);
    expect(cardMsg(id).receipt?.undone).toBeTruthy();
    fake.remixFails = true;
    const t2 = await say("make a post about CPF", { act: "make", format: "post" });
    await approve(t2);
    expect(cardMsg(t2).card).toMatchObject({ status: "failed", error: "No remixes left today. They reset at 8am Singapore time." });
    expect(cardMsg(t2).go?.map((g) => g.label)).toEqual(["Write it in Write"]);
  });

  it("a talking video runs the script card, the video card, the price check, then goes on at the price", async () => {
    fake.talkEnd = "priced";
    const id = await say("make a 20-second talking video about CPF LIFE", { act: "make", format: "speaking", length: 20 });
    let c = cardMsg(id).card!;
    expect([c.kind, c.step, approveLabel(c), c.price]).toEqual(["video", "script", "Write the script", priceOf("remix-make")]);
    expect(c.details?.find((d) => d.label === "Who appears")?.value).toMatch(/^AI presenter, labelled on the post: An? .*Singaporean/);
    expect(priced()).toEqual([]);
    await approve(id);
    expect(priced()).toEqual(["writeScript"]);
    c = cardMsg(id).card!;
    expect([c.status, c.step, approveLabel(c)]).toEqual(["proposed", "video", "Approve and make"]);
    expect(c.script?.[0]).toBe("Most people never check what CPF LIFE will pay them.");
    expect(c.price?.kind).toBe("about");
    expect(c.credits).toBeGreaterThan(0);
    expect(cardMsg(id).text).toBe(LINES.scriptLead);
    const quote = c.credits! * 0.0625;
    await approve(id);
    expect(priced()).toEqual(["writeScript", "startTalk:presenter"]);
    // the price check stops only above the video card's own price (live-p5dog day 3)
    expect(fake.talkAsk?.quoted).toBeCloseTo(quote, 9);
    c = cardMsg(id).card!;
    expect([c.status, approveLabel(c), c.line]).toEqual(["proposed", "Make it for US$3.31", "The voiceover runs 18 seconds, so this costs about US$3.31."]);
    await approve(id);
    expect(priced()).toEqual(["writeScript", "startTalk:presenter", "goOnAtPrice"]);
    expect(cardMsg(id).receipt).toMatchObject({ title: "Video made", undoText: "Paid makes can't be undone. Delete the draft in My posts if you don't want it." });
    expect(cardMsg(id).receipt?.line).toMatch(/It used \d+ Higgsfield credits, about US\$\d+\.\d\d\.$/);
  });

  it("a priced talk counts as busy: another video is refused before any card", async () => {
    fake.talk.set({ id: 9, state: "priced", step: "", params: {} });
    const id = await say("make a talking video about CPF", { act: "make", format: "speaking" });
    expect(last(id).text).toBe(LINES.videoBusy);
    expect(last(id).card).toBeUndefined();
  });

  it("an explainer writes its script on the first press and makes the video on the second", async () => {
    const id = await say("make an explainer about CPF LIFE", { act: "make", format: "explainer" });
    expect(approveLabel(cardMsg(id).card!)).toBe("Write the script");
    expect(priced()).toEqual([]);
    await approve(id);
    expect(priced()).toEqual(["writeExplainer"]);
    const c = cardMsg(id).card!;
    expect([c.status, c.step, c.line]).toEqual(["proposed", "video", "5 pictures with your voiceover, about 20 seconds."]);
    await approve(id);
    expect(priced()).toEqual(["writeExplainer", "makeExplainer"]);
    expect(cardMsg(id).receipt?.title).toBe("Video made");
  });

  it("a competitor from a handle adds with no read; a typed name is read only after the press, and Undo removes it", async () => {
    let id = await say("add @finchcare as a competitor", { act: "competitor" });
    expect(last(id).text).toBe("This adds finchcare once to the competitors you track.");
    expect(cardMsg(id).card).toMatchObject({ title: "Add finchcare as a competitor", line: "@finchcare", needs: [] });
    await approve(id);
    expect(loadCompetitors(UID).list.map((c) => c.name)).toEqual(["finchcare"]);
    expect(priced()).toEqual([]);
    id = await say("add a competitor", { act: "competitor" });
    expect(cardMsg(id).card?.title).toBe("Add a competitor");
    expect(editCard(UID, id, cardMsg(id).id, { name: "Finch" })).toBeNull();
    expect(cardMsg(id).card).toMatchObject({ title: "Add Finch as a competitor", price: priceOf("competitor-read") });
    expect(priced()).toEqual([]);
    await approve(id);
    expect(priced()).toEqual(["runRead"]);
    expect(cardMsg(id).receipt).toMatchObject({ title: "Competitor added", line: "Finch is on your list." });
    expect(await undoReceipt(UID, id, cardMsg(id).id)).toBe(UNDONE);
    expect(loadCompetitors(UID).list.map((c) => c.name)).toEqual(["finchcare"]);
    expect(loadActivity(UID, [new Date().toISOString().slice(0, 7)]).map((e) => [e.who, e.title])).toEqual(
      expect.arrayContaining([["agent", 'Added "Finch" as a competitor'], ["you", 'Undid "Competitor added"']]),
    );
  });

  it("a campaign card's price is its writing uses, beside campaignCost; Add writes it and Undo deletes it", async () => {
    const a = saveAudience(UID, { name: "Young parents", who: "Parents in their 30s", lifeStage: "parent", cares: ["school fees"] });
    if (a.ok === false) throw new Error(a.error);
    confirmAngles(UID, a.audience.id, [{ title: "School fees add up", line: "Plan early", origin: "mine" }]);
    const id = await say("plan a month of posts for young parents, every day", { act: "campaign", audience: 0, weeks: 4, pace: 7 });
    const c = cardMsg(id).card!;
    const posts = Number(c.line.match(/^(\d+) posts/)?.[1]);
    expect(posts).toBe(28);
    expect(c.price?.usd).toBeCloseTo(Math.ceil(posts / 7) * (priceOf("campaign-draft") as Price).usd, 6);
    expect(c.details?.find((d) => d.label === "Writing them")?.value).toBe(priceText(c.price!));
    const later = campaignCost({ posts: Array.from({ length: posts }, () => ({ format: "text-post", state: "waiting" })) as never }, { video: null, remix: null });
    expect(c.details?.find((d) => d.label === "Later makes")?.value).toBe(later.usd ? expect.any(String) : "None: every post is words only");
    expect(c.needs).toEqual([{ feature: "campaign-draft", n: 4 }]);
    expect(priced()).toEqual([]);
    await approve(id);
    expect(priced()).toEqual(["startDrafting"]);
    expect(loadCampaigns(UID)).toHaveLength(1);
    expect(cardMsg(id).receipt).toMatchObject({ title: "Campaign added", undoText: "The writing already used is not given back." });
    expect(await undoReceipt(UID, id, cardMsg(id).id)).toBe(UNDONE);
    expect(loadCampaigns(UID)).toHaveLength(0);
  });

  it("a campaign with no saved angles links to the planner instead", async () => {
    const id = await say("plan a campaign", { act: "campaign" });
    expect(last(id)).toMatchObject({ text: "I'll set it up in the campaign planner." });
    expect(last(id).go?.[0].label).toBe("Plan a campaign");
  });

  it("an edit proposes on the first press and changes the page only on Use this; Undo is the page's", async () => {
    const page = { text: "old", undone: false };
    const target = {
      kind: "carousel" as const,
      title: "5 CPF myths",
      slides: ["Myth 1", "Myth 2", "Myth 3"],
      onScreen: 1,
      propose: vi.fn(async () => {
        fake.calls.push("propose");
        return { reply: "Made it shorter.", preview: "Topping up your CPF? This one is guaranteed.", flags: [], apply: () => (fake.calls.push("apply"), (page.text = "new"), { done: "Done. Slide 3 changed. Undo here or on the page.", undo: () => void (page.undone = true) }) };
      }),
    };
    const off = registerEditTarget(target);
    const id = await say("make slide 3 shorter", { act: "edit", slide: 2 });
    const c = cardMsg(id).card!;
    expect([c.title, approveLabel(c), c.price]).toEqual(['Change slide 3 of "5 CPF myths"?', "Write the change", priceOf("edit-ask")]);
    expect(jev.bodies[0].open).toEqual({ kind: "carousel", title: "5 CPF myths", slides: ["Myth 1", "Myth 2", "Myth 3"], onScreen: 1 });
    expect(priced()).toEqual([]);
    await approve(id);
    expect(target.propose).toHaveBeenCalledWith("make slide 3 shorter", 3);
    expect(cardMsg(id).card).toMatchObject({ status: "proposed", step: "apply", preview: "Topping up your CPF? This one is guaranteed.", flags: ['Check: "guaranteed" is flagged.'] });
    expect(page.text).toBe("old");
    await approve(id);
    expect(page.text).toBe("new");
    // the log names what changed, not the page's "Done."
    expect(loadActivity(UID, [new Date().toISOString().slice(0, 7)]).some((e) => e.title === "Slide 3 changed")).toBe(true);
    expect(await undoReceipt(UID, id, cardMsg(id).id)).toBe(UNDONE);
    expect(page.undone).toBe(true);
    // the item closed before the press
    const t2 = await say("end on a question", { act: "edit" });
    off();
    await approve(t2);
    expect(cardMsg(t2).card).toMatchObject({ status: "failed", error: "That carousel is no longer open. Open it and ask again." });
  });

  it("an edit the writer can't do in words answers in its words, with no refund line and no Try again", async () => {
    const target = {
      kind: "video" as const,
      title: "CPF reel",
      propose: vi.fn(async () => ({ reply: "Music is added on the Cuts tab, not with words.", preview: "", flags: [], apply: () => ({ done: "", undo: () => undefined }) })),
    };
    const off = registerEditTarget(target);
    const id = await say("add music", { act: "edit" });
    await approve(id);
    off();
    const m = cardMsg(id);
    expect(m.card?.status).not.toBe("failed");
    expect(m.receipt).toMatchObject({ title: "No change made", line: "Music is added on the Cuts tab, not with words." });
    expect(m.receipt?.undo).toBeUndefined();
  });

  it("Open in Write opens Write only on the press", async () => {
    saveDrafts(UID, [post()]);
    const go = vi.fn((path: string) => fake.calls.push(`navigate:${path}`));
    setNavigate(go);
    const id = await say("rewrite my CPF myths post shorter", { act: "write", post: 0 });
    expect([approveLabel(cardMsg(id).card!), priceText(cardMsg(id).card!.price!)]).toEqual(["Open in Write", "About US$0.01"]);
    expect(go).not.toHaveBeenCalled();
    await approve(id);
    expect(go).toHaveBeenCalledWith("/generate?draft=p1&ask=rewrite%20my%20CPF%20myths%20post%20shorter");
  });
});

describe("budget before the card and again on the press", () => {
  const today = () => new Date().toISOString().slice(0, 10);
  it("refuses a talking video with no videos left, before any script, with two cheaper chips", async () => {
    fake.usage = { day: today(), used: { "ai-video": 2 } };
    const id = await say("make a video of me explaining CPF LIFE", { act: "make", format: "speaking" });
    expect(last(id).text).toBe("A talking video needs 1 AI video, and you have none left today. They come back at 8am Singapore time.\nA picture post is under US$0.01 (5 of 5 pictures left), or a script you film yourself is under US$0.01.");
    expect(last(id).go?.map((g) => g.label)).toEqual(["Make the picture post", "Write the script"]);
    expect(last(id).card).toBeUndefined();
    expect(priced()).toEqual([]);
    // the chip asks again here, as a new message
    jev.pick = pk({ act: "make", format: "image" });
    expect(choose(UID, id, last(id).id, last(id).go![0].path)).toBeNull();
    await vi.waitFor(() => expect(cardMsg(id)?.card?.kind).toBe("image"), { interval: 2 });
  });

  it("disables Approve on a card whose cap ran out while it waited", async () => {
    const id = await say("make a carousel about CPF", { act: "make", format: "carousel" });
    fake.usage = { day: today(), used: { "remix-make": 30 } };
    await approve(id);
    expect(cardMsg(id).card).toMatchObject({ status: "proposed", error: "No remixes left today. Back at 8am Singapore time." });
    expect(priced()).toEqual([]);
  });
});

describe("typed approve and decline", () => {
  it("a yes approves the one proposed card under US$1, a no declines it, and both are logged for autonomy", async () => {
    const id = await say("make a carousel about CPF", { act: "make", format: "carousel" }, { p: { act: 0.95, format: 0.9 } });
    await say("yes go ahead", { act: "approve" }, { thread: id });
    await settled(id);
    expect(priced()).toEqual(["startRemix:carousel"]);
    await vi.waitFor(() => expect(cardMsg(id).receipt?.title).toBe("Carousel written"), { interval: 2 });
    const t2 = await say("make a post about CPF", { act: "make", format: "post" });
    await say("not now", { act: "decline" }, { thread: t2 });
    expect(cardMsg(t2).card?.status).toBe("declined");
    expect(last(t2).text).toBe(NOT_MADE);
    expect(loadShadow(UID).map((s) => [s.act, s.confirmed])).toEqual([["make", false], ["make", true]]);
    expect(loadShadow(UID)[1].p).toMatchObject({ act: 0.95, format: 0.9 });
  });

  it("a yes never spends US$1 or more: it asks for the press", async () => {
    fake.talkEnd = "done";
    const id = await say("make a talking video about CPF LIFE", { act: "make", format: "speaking" });
    await approve(id);
    await say("yes make it", { act: "approve" }, { thread: id });
    expect(last(id).text).toMatch(/^Press Approve to spend About US\$\d+\.\d\d\.$/);
    expect(priced()).toEqual(["writeScript"]);
  });

  it("a bare ok never approves, whatever the pick", async () => {
    const id = await say("make a carousel about CPF", { act: "make", format: "carousel" });
    await say("ok", { act: "approve" }, { thread: id });
    expect(priced()).toEqual([]);
    expect(cardMsg(id).card?.status).toBe("proposed");
  });
});

describe("the chip path with Jev null", () => {
  it("a pressed chip becomes a card in that format, and a campaign chip the planner", async () => {
    let id = await say("CPF LIFE for young parents", null, { chip: "carousel" });
    expect(cardMsg(id).card).toMatchObject({ kind: "make", title: 'Carousel: "CPF LIFE for young parents"' });
    id = await say("CPF LIFE explained", null, { chip: "video" });
    expect(cardMsg(id).card).toMatchObject({ kind: "video", step: "script" });
    id = await say("我想做一个视频", null, { chip: "post" });
    expect(jev.bodies.length).toBe(2); // not English: no Jev call
    expect(cardMsg(id).card?.title).toBe('Post: "我想做一个视频"');
    expect(priced()).toEqual([]);
  });
});

describe("autonomy", () => {
  it("moves a post at once only in auto mode with both cuts held; otherwise it is a card", async () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2099-10-14T09:00" })]);
    const sure = { act: 0.9, post: 0.9, day: 0.9 };
    let id = await say("move my CPF myths post to the 16th", { act: "move", post: 0, day: "2099-10-16" }, { p: sure });
    expect(cardMsg(id).card?.status).toBe("proposed");
    expect(loadDrafts(UID)[0].scheduledFor).toBe("2099-10-14T09:00");
    saveAutonomy(UID, { changes: "auto" });
    id = await say("move my CPF myths post to the 16th", { act: "move", post: 0, day: "2099-10-16" }, { p: sure });
    expect(loadDrafts(UID)[0].scheduledFor).toBe("2099-10-16T09:00");
    expect(last(id).text).toMatch(/^Moved "Three CPF myths" to .*\. You asked me not to check first\.$/);
    expect(cardMsg(id).receipt).toMatchObject({ title: "Moved", undo: { kind: "restore-draft", was: "2099-10-16T09:00" } });
    id = await say("move it later", { act: "move", post: 0, day: "2099-10-18" }, { p: { act: 0.9, post: 0.6, day: 0.9 } });
    expect(cardMsg(id).card?.status).toBe("proposed");
    expect(await undoReceipt(UID, thread(loadThreads(UID)[1].id).id, cardMsg(loadThreads(UID)[1].id).id)).toBe(UNDONE);
    expect(loadDrafts(UID)[0].scheduledFor).toBe("2099-10-14T09:00");
  });
});

describe("memory", () => {
  it("Remember saves with the thread and message; undo removes it; forget asks with chips that act with no Jev call", async () => {
    let id = await say("from now on use an older man as my presenter", { act: "remember", scope: "videos" });
    const c = cardMsg(id).card!;
    expect([c.title, c.line, approveLabel(c)]).toEqual(["Remember this for your videos?", '"from now on use an older man as my presenter"', "Remember"]);
    await approve(id);
    const saved = activeLearnings(loadLearnings(UID))[0];
    expect(saved).toMatchObject({ text: "from now on use an older man as my presenter", thread: id, msg: cardMsg(id).id, source: "assistant" });
    expect(cardMsg(id).receipt).toMatchObject({ title: "Learning recorded", undo: { kind: "learning-off", id: saved.id } });
    await say("undo", { act: "forget", which: "last" }, { thread: id });
    expect(last(id).text).toBe("Undid: Learning recorded.");
    expect(activeLearnings(loadLearnings(UID))).toEqual([]);
    // say it again, then forget it by name: the Learning removed receipt's Undo brings it back
    id = await say("from now on use an older man as my presenter", { act: "remember", scope: "videos" });
    await approve(id);
    await say("forget the presenter thing", { act: "forget", which: 0 }, { thread: id });
    expect(last(id).receipt).toMatchObject({ title: "Learning removed", line: "from now on use an older man as my presenter" });
    expect(activeLearnings(loadLearnings(UID))).toEqual([]);
    expect(await undoReceipt(UID, id, last(id).id)).toBe(UNDONE);
    expect(activeLearnings(loadLearnings(UID))).toHaveLength(1);
    await say("forget it", { act: "forget" }, { thread: id });
    expect(last(id).text).toBe("Which one should I forget?");
    const before = jev.bodies.length;
    choose(UID, id, last(id).id, last(id).go![0].path);
    expect(last(id).receipt?.title).toBe("Learning removed");
    expect(jev.bodies.length).toBe(before);
  });

  it("a talking video's card follows the video learnings", async () => {
    let id = await say("from now on use an older man as my presenter", { act: "remember", scope: "videos" });
    await approve(id);
    id = await say("make a talking video about CPF", { act: "make", format: "speaking", who: 4 });
    const c = cardMsg(id).card!;
    expect(c.details?.find((d) => d.label === "Following")?.value).toBe("from now on use an older man as my presenter");
    expect(c.details?.find((d) => d.label === "Who appears")?.value).toBe("AI presenter, labelled on the post: A Chinese Singaporean man in his 50s, short greying hair, rimless glasses, dark green polo shirt");
    expect((jev.bodies[1].learnings as string[])[0]).toBe("from now on use an older man as my presenter (videos)");
  });

  it("answers what it remembers with no call beyond the message", async () => {
    const id = await say("what do you remember about me", { act: "memory" });
    expect(last(id).text).toBe('Nothing yet. Tell me something like "always end with a question" and I\'ll keep to it.');
  });
});

describe("skills", () => {
  // chatSkills.ts as merged: slashes are ids, matchSlash takes any word, runSkill answers unknown, pick-post and open itself
  const BUILT = ["check", "retro", "check-week", "answer"];
  const api = (): SkillsApi => ({
    PRICED: ["answer"],
    loadMySkills: () => [{ id: "s1", name: "Tighten for LinkedIn", slash: "tighten-for-linkedin", instruction: "Tighten it for LinkedIn" }],
    matchSlash: (text: string) => {
      const m = /^\/([^\s/]+)\s*([\s\S]*)$/.exec(text.trim());
      return m ? { skill: m[1], rest: m[2] } : null;
    },
    runSkill: async (_u: string, skill: string, input: { postId?: string }) => {
      fake.calls.push(`runSkill:${skill}`);
      if (skill === "tighten-for-linkedin") return input.postId ? { id: "", name: "Tighten for LinkedIn", title: "Three CPF myths", step: "open", postId: input.postId, lines: ["Open it"], links: [{ label: "Open in Write", path: "/generate" }] } : { id: "", name: "", title: "", step: "pick-post", lines: ["Which post? Pick one."], links: [] };
      if (!BUILT.includes(skill)) return { id: "", name: `/${skill}`, title: "", step: "unknown", lines: [`No skill called /${skill}. Yours are /check, /retro, /check-week, /tighten-for-linkedin.`], links: [{ label: "Open skills", path: "/skills" }] };
      return { id: `r-${skill}`, name: skill, title: "", lines: [`Ran ${skill}.`], links: [{ label: "Open Analytics", path: "/analytics" }], calls: skill === "check" ? 3 : 1 };
    },
    skillRunText: (r) => [`${r.name}:`, ...r.lines].join("\n"),
  });
  it("a slash message runs the skill with no Jev call, counting its calls; an unknown one gets runSkill's list", async () => {
    setSkills(api());
    let id = await say("/retro", null);
    expect(jev.bodies).toEqual([]);
    expect(last(id)).toMatchObject({ text: "retro:\nRan retro.", go: [{ label: "Open Analytics", path: "/analytics" }], meta: { steps: 1 } });
    id = await say("/nope", null);
    expect(last(id).text).toBe("No skill called /nope. Yours are /check, /retro, /check-week, /tighten-for-linkedin.");
    expect(jev.bodies).toEqual([]);
  });
  it("check and week acts route to the same runs with the post Jev picked; answer waits for its priced card", async () => {
    setSkills(api());
    saveDrafts(UID, [post()]);
    let id = await say("check my CPF post before I post it", { act: "check", post: 0 });
    expect(last(id)).toMatchObject({ text: "check:\nRan check.", meta: { steps: 4 } });
    id = await say("how did last week go", { act: "week" });
    expect(last(id).text).toBe("retro:\nRan retro.");
    id = await say("/answer", null);
    expect([approveLabel(cardMsg(id).card!), cardMsg(id).card!.price]).toEqual(["Write 3 angles", priceOf("skill-answer")]);
    expect(priced()).toEqual(["runSkill:check", "runSkill:retro"]);
    await approve(id);
    expect(fake.calls.slice(fake.calls.lastIndexOf("PRESS"))).toContain("runSkill:answer");
    expect(cardMsg(id).text).toBe("answer:\nRan answer.");
  });
  it("one of your skills on a post is an Open in Write card, since Write's rewrite is priced", async () => {
    setSkills(api());
    saveDrafts(UID, [post()]);
    const id = await say("tighten my CPF post", { act: "make", skill: 0, post: 0 });
    expect([approveLabel(cardMsg(id).card!), cardMsg(id).card!.title]).toEqual(["Open in Write", 'Rewrite "Three CPF myths" in Write']);
  });
});

describe("what Home reads", () => {
  it("lists waiting cards, says what is waiting, and what was just made", async () => {
    const id = await say("make a carousel about CPF", { act: "make", format: "carousel" });
    expect(waitingCards(UID)).toEqual([{ thread: id, msg: cardMsg(id).id, card: cardMsg(id).card }]);
    expect(agentNow(UID)).toEqual({ kind: "waiting", line: '"Carousel: "make a carousel about CPF"" is waiting for your OK.', to: `/agent/${id}?m=${cardMsg(id).id}` });
    await approve(id);
    expect(waitingCards(UID)).toEqual([]);
    expect(agentNow(UID)).toMatchObject({ kind: "ready", line: "Your carousel is ready" });
  });
});

describe("cards change before the press", () => {
  it("a script edit re-prices at 2.5 words a second; out-of-range scripts and approved cards are refused", async () => {
    const id = await say("make a talking video about CPF", { act: "make", format: "speaking" });
    await approve(id);
    const words40 = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    expect(editCard(UID, id, cardMsg(id).id, { script: words40 })).toBeNull();
    expect(cardMsg(id).card).toMatchObject({ credits: 44 });
    // a new AI presenter's picture is in the price: estimateScript's own figure, 16 s in slices of 9.5 and 6.5
    expect(cardMsg(id).card!.price).toEqual(estimateScript(40, { presenter: true }).price);
    expect(priceText(cardMsg(id).card!.price!)).toBe("About US$2.78");
    expect(fieldsOf(cardMsg(id).card!).length).toBe(15);
    expect(editCard(UID, id, cardMsg(id).id, { script: "too short" })).toBe("Write at least 19 words for a video.");
    expect(editCard(UID, id, cardMsg(id).id, { script: `${words40} ${words40}` })).toBe("70 words at most.");
    expect(editCard(UID, id, cardMsg(id).id, { format: "carousel" })).toBeNull();
    expect(cardMsg(id).card).toMatchObject({ kind: "make", title: 'Carousel: "make a talking video about CPF"' });
    await approve(id);
    expect(editCard(UID, id, cardMsg(id).id, { format: "post" })).toBe("Approved. Ask for a new one to change it.");
  });
});

describe("the 25 Oct replay: follow-ups keep their subject, titles name it, a competitor by name (D2, D3, D12)", () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const SUBJECT = "keeping prospecting consistent with ActivityTracker";
  const TALK = `make a talking head video about ${SUBJECT}`;

  it("titles a card with Jev's subject, not the command, cut at a word (D12)", async () => {
    const id = await say(TALK, { act: "make", format: "speaking", subject: SUBJECT });
    expect(cardMsg(id).card?.title).toBe(`Talking video: "${SUBJECT}"`);
    const pic = await say("make a picture of a phone on a cafe table showing a sales to-do list with three follow-ups ticked off", {
      act: "make",
      format: "image",
      subject: "a phone on a cafe table showing a sales to-do list with three follow-ups ticked off",
    });
    expect(cardMsg(pic).card?.title).toBe("Picture: a phone on a cafe table showing a sales");
  });

  it("makes another one of the last make about its subject, and sends the last make to Jev (D3)", async () => {
    const id = await say(TALK, { act: "make", format: "speaking", subject: SUBJECT });
    const first = cardMsg(id).id;
    await say("can you create another one", { act: "make", subject: "last" }, { thread: id });
    expect(jev.bodies[1].last).toEqual({ format: "speaking", subject: SUBJECT });
    const c = cardMsg(id);
    expect(c.id).not.toBe(first);
    expect([c.card?.kind, c.card?.title, fieldsOf(c.card!).topic]).toEqual(["video", `Talking video: "${SUBJECT}"`, TALK]);
  });

  it("offers cheaper chips about the subject, never the whole ask, so the picture chip is a picture (D3)", async () => {
    const id = await say(TALK, { act: "make", format: "speaking", subject: SUBJECT });
    fake.usage = { day: today(), used: { "ai-video": 2 } };
    await say("can you create another talking video like the last one", { act: "make", format: "speaking", subject: "last" }, { thread: id });
    expect(last(id).go?.map((g) => g.path)).toEqual([`say:Make a picture post about ${SUBJECT}`, `say:Write a script about ${SUBJECT}`]);
    const t2 = await say("make a talking video about following up within a day of every client chat", { act: "make", format: "speaking", subject: "following up within a day of every client chat" });
    expect(last(t2).go?.[0].path).toBe("say:Make a picture post about following up within a day of every client chat");
  });

  it("fills the competitor card from the name Jev read, with the read's price on the card (D2)", async () => {
    const id = await say("add Finch as a competitor", { act: "competitor", name: "Finch" });
    expect(last(id).text).toBe("This adds Finch once to the competitors you track.");
    expect(cardMsg(id).card).toMatchObject({ title: "Add Finch as a competitor", price: priceOf("competitor-read") });
    expect(priced()).toEqual([]);
    await approve(id);
    expect(priced()).toEqual(["runRead"]);
  });

  it("ends a receipt's line once, cut at a word, and says an 18-second video (D12)", async () => {
    const id = await say("make a talking video about CPF LIFE", { act: "make", format: "speaking" });
    await approve(id);
    const words46 = Array.from({ length: 46 }, (_, i) => (i % 9 === 8 ? "end." : "word")).join(" ");
    expect(editCard(UID, id, cardMsg(id).id, { script: words46 })).toBeNull();
    expect(cardMsg(id).card?.line).toMatch(/^An 18-second video of/);
    expect(editCard(UID, id, cardMsg(id).id, { script: SCRIPT })).toBeNull();
    await approve(id);
    const line = cardMsg(id).receipt!.line;
    expect(line).not.toMatch(/\.\.\.\./);
    expect(line).toMatch(/^Most people never check what CPF LIFE will pay them\. Here's where to see your\.\.\. It used/);
  });
});

describe("the 25 Oct replay: a talking video's voice, length and caption (D4, D5, D13)", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => (i % 9 === 8 ? "end." : "word")).join(" ");

  it("gives a presenter a voice that fits their look, over the remembered Alice, and follows Who appears (D4)", async () => {
    // no face or presenters saved: the six looks are sent in order, so 4 is the older man and 0 a woman
    const id = await say("make a talking video about CPF LIFE with the older man", { act: "make", format: "speaking", who: 4 });
    let c = cardMsg(id).card!;
    expect([fieldsOf(c).look, fieldsOf(c).voice]).toEqual([expect.stringContaining("man in his 50s"), "eric"]);
    expect(c.details?.find((d) => d.label === "Voice")?.value).toBe("Eric");
    const woman = await say("make a talking video about CPF LIFE", { act: "make", format: "speaking", who: 0 });
    expect(fieldsOf(cardMsg(woman).card!).voice).toBe("alice");
    await approve(id);
    expect(fake.scriptAsk?.words).toBe(37);
    await approve(id);
    expect(fake.talkAsk?.voice).toBe("eric");
    c = cardMsg(woman).card!;
    expect(editCard(UID, woman, cardMsg(woman).id, { who: "new" })).toBeNull();
    expect(fieldsOf(cardMsg(woman).card!).voice).toBe("alice");
  });

  it("asks the writer for the words the length takes in the card's voice, and a voice change prices the script again (D5)", async () => {
    const id = await say("make a 15 second talking video about CPF LIFE with the woman", { act: "make", format: "speaking", length: 15, who: 0 });
    await approve(id);
    expect(fake.scriptAsk).toMatchObject({ as: "speaking", seconds: 15, words: 38 });
    // 43 words: 16.8 s in Alice's voice is two parts, 17.9 s in George's is three
    expect(editCard(UID, id, cardMsg(id).id, { script: words(43) })).toBeNull();
    const alice = cardMsg(id).card!;
    expect([alice.credits, alice.line]).toEqual([44, "A 17-second video of your presenter saying this script."]);
    expect(editCard(UID, id, cardMsg(id).id, { voice: "george" })).toBeNull();
    const george = cardMsg(id).card!;
    expect([george.credits, george.line, george.details?.find((d) => d.label === "Length")?.value]).toEqual([55, "An 18-second video of your presenter saying this script.", "about 18 seconds"]);
    expect(george.price!.usd).toBeGreaterThan(alice.price!.usd);
    expect(george.price).toEqual(estimateScript(43, { presenter: true, voice: "george" }).price);
  });

  it("takes the writer's caption with its call to action to the editor with the video (D13)", async () => {
    const id = await say("make a talking video about CPF LIFE", { act: "make", format: "speaking" });
    await approve(id);
    await approve(id);
    expect(fake.talkAsk?.caption).toBe("Check your own payout tonight. Save this for later.");
  });
});

describe("the 25 Oct replay: a made video opens its own project (D7)", () => {
  it("opens the editor, which takes the video, and then the project it saved under the video's name, never the empty AI panel", async () => {
    const { madeOpen } = await import("@/lib/agentPlans");
    const { saveProject } = await import("@/lib/videoProjects");
    const project = (id: string, name: string, createdAt: string) => ({ id, name, createdAt, updatedAt: "", duration: 15, size: 1, words: [], settings: {}, thumb: "" }) as unknown as Parameters<typeof saveProject>[1];
    const id = await say("make a talking video about CPF LIFE", { act: "make", format: "speaking" });
    await approve(id);
    await approve(id);
    const m = cardMsg(id);
    expect(m.job).toMatchObject({ kind: "talk", open: "/edit", name: SCRIPT.slice(0, 40) });
    expect(m.receipt?.button?.path).toBe("/edit");
    expect(madeOpen(UID, m.job)).toBe("/edit");
    // one of the same name from before this make is another video
    saveProject(UID, project("vold", SCRIPT.slice(0, 40), "2020-01-01T00:00:00.000Z"));
    expect(madeOpen(UID, m.job)).toBe("/edit");
    saveProject(UID, project("vmade", SCRIPT.slice(0, 40), new Date(Date.parse(m.job!.startedAt) + 1000).toISOString()));
    expect(madeOpen(UID, m.job)).toBe("/edit?p=vmade");
  });
});

describe("the 25 Oct replay: what the agent started logs as the agent's (D6, the engine's side)", () => {
  it("hands its chat to the slideshow, wall, picture and talking video jobs, and logs the script it writes itself", async () => {
    const at = (id: string) => ({ thread: id, msg: cardMsg(id).id });
    const show = await say("make a slideshow about CPF LIFE", { act: "make", format: "slideshow" });
    await approve(show);
    expect(fake.show.get().ask.agent).toEqual(at(show));
    const wall = await say("make a wall of text about CPF", { act: "make", format: "wall" });
    await approve(wall);
    expect(fake.wall.get().ask.agent).toEqual(at(wall));
    const pic = await say("make a picture of a family at a hawker centre", { act: "make", format: "image" });
    await approve(pic);
    expect(fake.imageAgent).toEqual(at(pic));
    const talk = await say("make a talking video about CPF LIFE", { act: "make", format: "speaking" });
    await approve(talk);
    expect(loadActivity(UID, [new Date().toISOString().slice(0, 7)]).find((e) => e.title === "Wrote a talking video script")).toMatchObject({ who: "agent", detail: SCRIPT });
    await approve(talk);
    expect(fake.talkAsk?.agent).toEqual(at(talk));
  });
});
