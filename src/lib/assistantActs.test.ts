import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DockAct, DockDone } from "@/components/feedback/AssistantDock";
import { actFor, askAgent, conflictFor, moveWhen, pastedPart, postsForJev, proposeAct } from "@/lib/assistantActs";
import { EdgeError } from "@/lib/edgeFn";
import { activeLearnings, addLearning, loadLearnings } from "@/lib/voiceMemory";
import { loadDrafts, saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { loadRun, saveRun } from "@/lib/engageDrafts";
import type { ActPick } from "../../supabase/functions/assistant-act/logic.ts";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const TODAY = "2026-10-11";
const store = new Map<string, string>();
const changed = vi.fn();
const go = vi.fn();

const post = (extra: Partial<DraftEntry>): DraftEntry => ({
  id: "a",
  createdAt: "2026-10-01T00:00:00.000Z",
  hook: "Three CPF myths",
  draft: "Myth one...",
  pillar: "topic",
  pillarDetail: "",
  audience: "general",
  format: "text-post",
  platform: "linkedin",
  ctaType: "dm-keyword",
  ...extra,
});
/** The day as the app shows it in this locale (Calendar's format). */
const day = (d: number) => new Date(2026, 9, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const pick = (extra: Partial<ActPick>): ActPick => ({ act: "move", post: 0, day: null, time: null, ...extra });
const card = (a: DockAct | null) => {
  if (!a || !("ask" in a)) throw new Error(`not a card: ${JSON.stringify(a)}`);
  return a;
};

beforeEach(() => {
  store.clear();
  invoke.mockReset();
  changed.mockReset();
  go.mockReset();
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage, location: { pathname: "/home" }, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("dispatchEvent", changed);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 11, 10, 0)); // Sun 11 Oct 2026, local
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("postsForJev", () => {
  it("names each post and says where it stands", () => {
    expect(
      postsForJev([
        post({ status: "scheduled", scheduledFor: "2026-10-14T09:00" }),
        post({ id: "b", hook: "", pillarDetail: "CPF LIFE payouts" }),
        post({ id: "c", hook: "", draft: "\n  First line\nmore", status: "posted", postedAt: "2026-10-02T01:00:00.000Z", platform: "facebook" }),
        post({ id: "d", hook: "", draft: "" }),
      ]),
    ).toEqual([
      { title: "Three CPF myths", status: "scheduled", when: "2026-10-14T09:00", platform: "linkedin" },
      { title: "CPF LIFE payouts", status: "draft", when: "", platform: "linkedin" },
      { title: "First line", status: "posted", when: "2026-10-02", platform: "facebook" },
      { title: "Untitled post", status: "draft", when: "", platform: "linkedin" },
    ]);
    expect(postsForJev(Array.from({ length: 60 }, (_, i) => post({ id: `p${i}` }))).length).toBe(50);
  });
});

describe("moving a post", () => {
  it("names the change, applies it like Calendar and undoes it exactly", () => {
    const before = post({ status: "scheduled", scheduledFor: "2026-10-14T09:00" });
    saveDrafts(UID, [before]);
    const c = card(actFor(UID, pick({ day: "2026-10-15", time: "20:00" }), "", loadDrafts(UID), TODAY, go));
    expect(c.yes).toBe("Move it");
    expect(c.ask).toBe(`Move "Three CPF myths" to ${day(15)}, 8pm?`);
    expect(loadDrafts(UID)[0].scheduledFor).toBe("2026-10-14T09:00"); // nothing changes before the tap
    const done = c.run() as DockDone;
    expect(done.done).toBe(`Moved "Three CPF myths" to ${day(15)}, 8pm.`);
    expect(loadDrafts(UID)[0]).toMatchObject({ status: "scheduled", scheduledFor: "2026-10-15T20:00" });
    expect(changed).toHaveBeenCalledTimes(1);
    done.undo!();
    expect(loadDrafts(UID)[0]).toEqual(before);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("schedules a draft, keeping the post's own time when none is said", () => {
    saveDrafts(UID, [post({})]);
    const c = card(actFor(UID, pick({ day: "2026-10-12" }), "", loadDrafts(UID), TODAY, go));
    expect(c.ask).toBe(`Schedule "Three CPF myths" for ${day(12)}?`);
    c.run();
    expect(loadDrafts(UID)[0]).toMatchObject({ status: "scheduled", scheduledFor: "2026-10-12" });

    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-14T09:00" })]);
    card(actFor(UID, pick({ day: "2026-10-20" }), "", loadDrafts(UID), TODAY, go)).run();
    expect(loadDrafts(UID)[0].scheduledFor).toBe("2026-10-20T09:00");
    // a new time alone keeps the day
    card(actFor(UID, pick({ time: "18:30" }), "", loadDrafts(UID), TODAY, go)).run();
    expect(loadDrafts(UID)[0].scheduledFor).toBe("2026-10-20T18:30");
  });

  it("offers nothing it can't do and says why when it knows", () => {
    saveDrafts(UID, [post({})]);
    expect(actFor(UID, pick({}), "", loadDrafts(UID), TODAY, go)).toBeNull(); // no day for a draft
    expect(actFor(UID, pick({ day: "2026-10-10" }), "", loadDrafts(UID), TODAY, go)).toBeNull();
    expect(actFor(UID, pick({ post: null, day: "2026-10-12" }), "", loadDrafts(UID), TODAY, go)).toBeNull();
    expect(actFor(UID, pick({ post: 3, day: "2026-10-12" }), "", loadDrafts(UID), TODAY, go)).toBeNull();
    const posted = actFor(UID, pick({ day: "2026-10-12" }), "", [post({ status: "posted", postedAt: "2026-10-01T00:00:00Z" })], TODAY, go);
    expect(posted).toMatchObject({ say: expect.stringContaining("is marked posted"), go: [{ path: "/drafts" }] });
    const zernio = post({ status: "scheduled", scheduledFor: "2026-10-14T09:00", zernio: { key: "k", postId: "z1", status: "scheduled" } });
    expect(actFor(UID, pick({ day: "2026-10-15" }), "", [zernio], TODAY, go)).toMatchObject({ say: expect.stringContaining("Post it for me") });
    // a cancelled Zernio post no longer holds the time
    expect(actFor(UID, pick({ day: "2026-10-15" }), "", [{ ...zernio, zernio: { key: "k", postId: "z1", status: "cancelled" } }], TODAY, go)).toHaveProperty("ask");
    const same = actFor(UID, pick({ day: "2026-10-14", time: "09:00" }), "", [post({ status: "scheduled", scheduledFor: "2026-10-14T09:00" })], TODAY, go);
    expect(same).toMatchObject({ say: expect.stringContaining("is already set for") });
  });

  it("refuses at the tap when the post changed since", () => {
    saveDrafts(UID, [post({})]);
    const c = card(actFor(UID, pick({ day: "2026-10-12" }), "", loadDrafts(UID), TODAY, go));
    saveDrafts(UID, [post({ status: "posted", postedAt: "2026-10-11T01:00:00.000Z" })]);
    expect(() => c.run()).toThrow("marked posted now");
    saveDrafts(UID, []);
    expect(() => c.run()).toThrow("no longer in My posts");
  });
});

describe("opening a post in Write", () => {
  it("passes the change for Write to offer", () => {
    const c = card(actFor(UID, pick({ act: "write" }), "make my CPF myths post shorter & warmer", [post({ id: "x y" })], TODAY, go));
    expect(c.ask).toBe('Open "Three CPF myths" in Write and rewrite it: "make my CPF myths post shorter & warmer"?');
    expect((c.run() as DockDone).open).toBe("/generate?draft=x%20y&ask=make%20my%20CPF%20myths%20post%20shorter%20%26%20warmer");
  });
  it("opens a board idea without a rewrite", () => {
    const c = card(actFor(UID, pick({ act: "write" }), "write up my idea", [post({ draft: "" })], TODAY, go));
    expect(c.ask).toBe('Open "Three CPF myths" in Write?');
    expect((c.run() as DockDone).open).toBe("/generate?draft=a");
  });
});

describe("last week's numbers", () => {
  it("are the This week card's report", () => {
    saveDrafts(UID, [
      post({ status: "posted", postedAt: "2026-10-09T02:00:00.000Z", metrics: { impressions: 1200, reactions: 30, comments: 5 } }),
      post({ id: "b", hook: "Old one", status: "posted", postedAt: "2026-10-01T02:00:00.000Z", metrics: { impressions: 1000, reactions: 20 } }),
    ]);
    const a = actFor(UID, pick({ act: "week", post: null }), "", [], TODAY, go);
    expect(a).toMatchObject({ go: [{ path: "/analytics" }] });
    const say = (a as { say: string }).say;
    expect(say).toContain("Last 7 days against the 7 before:");
    expect(say).toContain("1 post posted");
    expect(say).toContain("1,200 impressions (+20%), 35 engagements (+75%).");
    saveDrafts(UID, []);
    expect(actFor(UID, pick({ act: "week", post: null }), "", [], TODAY, go)).toMatchObject({ say: "No posts marked posted in the last 14 days." });
  });
});

describe("starting Engage with pasted text", () => {
  it("takes the paste, not the ask", () => {
    expect(pastedPart("Help me reply to these:\nSarah: Mine went up too\n\nTom: So true")).toBe("Sarah: Mine went up too\n\nTom: So true");
    expect(pastedPart("Sarah: how do I check my CPF?")).toBe("Sarah: how do I check my CPF?");
    expect(pastedPart("reply to this:")).toBe("reply to this:");
  });

  it("pastes into the tool, opens it and puts the old text back on Undo", () => {
    saveRun("replies", UID, { post: "My post", pasted: "Old comment", posts: [], form: {}, items: [{ id: 1 }], at: "2026-10-10T00:00:00Z" });
    const c = card(actFor(UID, pick({ act: "engage_replies", post: null }), "Reply to these:\nSarah: Mine went up too", [], TODAY, go));
    expect(c.ask).toBe('Paste this into Reply drafts > Comments on my post? It replaces what is there now.\n"Sarah: Mine went up too"');
    const done = c.run() as DockDone;
    expect(done.open).toBe("/recruit/engage");
    expect(loadRun("replies", UID)).toMatchObject({ post: "My post", pasted: "Sarah: Mine went up too", items: [], at: "" });
    window.location.pathname = "/recruit/engage";
    done.undo!();
    expect(loadRun("replies", UID)).toMatchObject({ pasted: "Old comment", items: [{ id: 1 }] });
    expect(go).toHaveBeenCalledWith("/recruit/engage", true);
  });

  it("opens one conversation in My DMs and someone's post in Comment on a post", () => {
    const thread = card(actFor(UID, pick({ act: "engage_thread", post: null }), "Amy: hi\nMe: hello", [], TODAY, go));
    expect(thread.ask.startsWith("Paste this into Reply drafts > My DMs, one conversation?\n")).toBe(true);
    const done = thread.run() as DockDone;
    expect(done.open).toBe("/recruit/engage?tool=dms");
    expect(loadRun("thread", UID).pasted).toBe("Amy: hi\nMe: hello");
    expect(loadRun("dms", UID).form.view).toBe("thread");
    done.undo!();
    expect(loadRun("dms", UID).form.view).toBeUndefined();
    expect(go).not.toHaveBeenCalled(); // not on Engage: nothing to reload

    card(actFor(UID, pick({ act: "engage_comment", post: null }), "Great post on retirement", [], TODAY, go)).run();
    expect(loadRun("comments", UID).posts).toEqual([{ name: "", text: "Great post on retirement" }]);
  });
});

describe("proposeAct", () => {
  it("asks the function with the posts and turns its pick into a card", async () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-14T09:00" })]);
    invoke.mockResolvedValue({ data: { pick: pick({ day: "2026-10-16" }) }, error: null });
    const a = await proposeAct(UID, "move my CPF myths post to Friday", go);
    expect(invoke).toHaveBeenCalledWith("assistant-act", {
      body: { message: "move my CPF myths post to Friday", today: TODAY, posts: [expect.objectContaining({ title: "Three CPF myths" })] },
    });
    expect(card(a).ask).toBe(`Move "Three CPF myths" to ${day(16)}, 9am?`);
  });
  it("leaves the chat to answer when there is no pick, an error or text not in English", async () => {
    invoke.mockResolvedValue({ data: { pick: null }, error: null });
    expect(await proposeAct(UID, "how do I add a label?", go)).toBeNull();
    invoke.mockResolvedValue({ data: null, error: new Error("429") });
    expect(await proposeAct(UID, "show my week", go)).toBeNull();
    invoke.mockReset();
    expect(await proposeAct(UID, "帮我把帖子移到星期五", go)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("remembering a preference (Leo only on the server)", () => {
  const remember = (scope: ActPick["scope"]) => pick({ act: "remember", post: null, scope });
  const refused = (status: number, code: string) => ({ data: null, error: { context: new Response(JSON.stringify({ code, error: "no" }), { status }) } });

  it("asks in the person's own words, clipped to 140, and saves one learning on Remember", () => {
    const words = `from now on never use emoji in my posts ${"please ".repeat(30)}`;
    const c = card(actFor(UID, remember("posts"), words, [], TODAY, go));
    const text = words.trim().slice(0, 140);
    expect(c.ask).toBe(`Remember this for your posts?\n"${text}"`);
    expect(c.yes).toBe("Remember");
    expect(loadLearnings(UID)).toEqual([]); // nothing before the tap
    const done = c.run() as DockDone;
    expect(done.done).toBe(`Learned: ${text}`);
    expect(done.go).toEqual([{ path: "/voice#learned", label: "See what the AI has learned" }]);
    expect(activeLearnings(loadLearnings(UID))).toEqual([expect.objectContaining({ text, scope: "posts", source: "assistant" })]);
    done.undo!();
    expect(activeLearnings(loadLearnings(UID))).toEqual([]);
  });

  it("names every kind for Everything", () => {
    expect(card(actFor(UID, remember("all"), "use Asian presenters", [], TODAY, go)).ask).toBe('Remember this for your posts, videos and pictures?\n"use Asian presenters"');
    expect(card(actFor(UID, remember(undefined), "use Asian presenters", [], TODAY, go)).ask.startsWith("Remember this for your posts, videos and pictures?")).toBe(true);
  });

  it("names the note it replaces, turns it off on Remember and back on with Undo", () => {
    const old = addLearning(UID, { text: "never use emoji in my posts", scope: "posts", source: "assistant" });
    const id = old.ok ? old.item.id : "";
    const c = card(actFor(UID, remember("posts"), "use lots of emoji", [], TODAY, go, { id, text: "never use emoji in my posts" }));
    expect(c.ask).toBe('Remember this for your posts?\n"use lots of emoji"\nThis replaces: "never use emoji in my posts"');
    const done = c.run() as DockDone;
    expect(activeLearnings(loadLearnings(UID)).map((l) => l.text)).toEqual(["use lots of emoji"]);
    done.undo!();
    expect(activeLearnings(loadLearnings(UID)).map((l) => l.text)).toEqual(["never use emoji in my posts"]);
  });

  it("says when the check is over its daily limit, and Remember still works", () => {
    const c = card(actFor(UID, remember("posts"), "end with a question", [], TODAY, go, "capped"));
    expect(c.ask).toBe('Remember this for your posts?\n"end with a question"\nNot checked against your earlier notes today.');
    expect((c.run() as DockDone).done).toBe("Learned: end with a question");
  });

  it("says it couldn't save when the device is full", () => {
    const c = card(actFor(UID, remember("posts"), "end with a question", [], TODAY, go));
    vi.stubGlobal("localStorage", { ...localStorage, getItem: () => null, setItem: () => { throw new Error("full"); } });
    expect(c.run()).toEqual({ done: "Couldn't save that. Try again." });
  });

  it("checks against the notes on now in that scope and Everything, and needs no call with none", async () => {
    expect(await conflictFor(UID, "use lots of emoji", "posts")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    addLearning(UID, { text: "never use emoji in my posts", scope: "posts", source: "typed" });
    addLearning(UID, { text: "use Asian presenters", scope: "videos", source: "typed" });
    addLearning(UID, { text: "keep it short", scope: "all", source: "typed" });
    invoke.mockResolvedValue({ data: { replaces: 1 }, error: null });
    const hit = await conflictFor(UID, "use lots of emoji", "posts");
    expect(invoke).toHaveBeenCalledWith("writing-judge", { body: { mode: "conflict", note: "use lots of emoji", notes: ["keep it short", "never use emoji in my posts"] } });
    expect(hit).toMatchObject({ text: "never use emoji in my posts" });
    invoke.mockResolvedValue({ data: { replaces: null }, error: null });
    expect(await conflictFor(UID, "use lots of emoji", "posts")).toBeNull();
    invoke.mockResolvedValue(refused(429, "daily_limit"));
    expect(await conflictFor(UID, "use lots of emoji", "posts")).toBe("capped");
    invoke.mockResolvedValue(refused(503, ""));
    expect(await conflictFor(UID, "use lots of emoji", "posts")).toBeNull();
    invoke.mockResolvedValue(refused(403, "not_enabled"));
    expect(await conflictFor(UID, "use lots of emoji", "posts")).toBeNull();
  });

  it("turns a remember pick into a card after the check, and a failed check never loses the card", async () => {
    addLearning(UID, { text: "never use emoji in my posts", scope: "posts", source: "typed" });
    invoke.mockImplementation(async (name: string) =>
      name === "assistant-act" ? { data: { pick: remember("posts") }, error: null } : { data: { replaces: 0 }, error: null },
    );
    const a = card(await proposeAct(UID, "from now on use lots of emoji in my posts", go));
    expect(a.ask).toContain('This replaces: "never use emoji in my posts"');
    invoke.mockImplementation(async (name: string) => (name === "assistant-act" ? { data: { pick: remember("posts") }, error: null } : { data: null, error: new Error("offline") }));
    const b = card(await proposeAct(UID, "from now on use lots of emoji in my posts", go));
    expect(b.ask).toBe('Remember this for your posts?\n"from now on use lots of emoji in my posts"');
  });
});

// Pin (phase 6, agent-run): everyone's dock calls proposeAct with no agent context. It must keep sending today's body
// exactly, offering today's acts, and a refusal at the daily cap must still leave the chat to answer in words.
describe("proposeAct for everyone (pinned before the agent's call is added)", () => {
  const refusal = (status: number, code: string) => ({ data: null, error: { context: new Response(JSON.stringify({ code, error: "You've used all 30 for today." }), { status }) } });
  it("sends today's body with no agent fields and turns each of today's acts into its card or answer", async () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-14T09:00" })]);
    const asks: Record<string, string> = {};
    for (const act of ["move", "write", "week", "engage_replies"] as const) {
      invoke.mockResolvedValue({ data: { pick: pick({ act, day: act === "move" ? "2026-10-16" : null }) }, error: null });
      const a = await proposeAct(UID, "Reply to these:\nGreat post!", go);
      asks[act] = a && "ask" in a ? a.yes : (a as { say: string } | null)?.say.split("\n")[0] ?? "null";
      expect(invoke).toHaveBeenLastCalledWith("assistant-act", { body: { message: "Reply to these:\nGreat post!", today: TODAY, posts: [expect.objectContaining({ title: "Three CPF myths" })] } });
      expect(Object.keys(invoke.mock.lastCall![1].body)).toEqual(["message", "today", "posts"]);
    }
    expect(asks).toEqual({ move: "Move it", write: "Open in Write", week: "No posts marked posted in the last 14 days.", engage_replies: "Paste it" });
  });
  it("answers in words (null) when assistant-act refuses at its daily cap", async () => {
    invoke.mockResolvedValue(refusal(429, "daily_limit"));
    expect(await proposeAct(UID, "move my CPF myths post to Friday", go)).toBeNull();
    invoke.mockResolvedValue(refusal(503, "usage_unavailable"));
    expect(await proposeAct(UID, "move my CPF myths post to Friday", go)).toBeNull();
  });
});

describe("askAgent (the agent's question, Leo only)", () => {
  const refusal = (status: number, code: string) => ({ data: null, error: { context: new Response(JSON.stringify({ code, error: "You've used all 100 for today. It resets at 8am Singapore time." }), { status }) } });
  it("sends today's body with agent: true and its fields, through the signal, and returns the pick with its probabilities", async () => {
    saveDrafts(UID, [post({})]);
    const answer = { pick: { act: "make", format: "carousel" }, p: { act: 0.9 } };
    invoke.mockResolvedValue({ data: answer, error: null });
    const signal = new AbortController().signal;
    expect(await askAgent(UID, "make a carousel about CPF LIFE", { chip: "carousel", speaker: "person", pending: "" }, signal)).toEqual(answer);
    expect(invoke).toHaveBeenCalledWith("assistant-act", {
      body: { message: "make a carousel about CPF LIFE", today: TODAY, posts: [expect.objectContaining({ title: "Three CPF myths" })], agent: true, chip: "carousel", speaker: "person", pending: "" },
      signal,
    });
  });
  it("throws a refusal to the caller instead of answering in words (the agent's cap line)", async () => {
    invoke.mockResolvedValue(refusal(429, "daily_limit"));
    const e = await askAgent(UID, "make a carousel", {}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EdgeError);
    expect(e).toMatchObject({ status: 429, code: "daily_limit" });
  });
});

describe("moveWhen", () => {
  it("keeps a scheduled post's day and time unless the pick names them, and refuses a past day", () => {
    const d = post({ status: "scheduled", scheduledFor: "2026-10-14T09:00" });
    expect(moveWhen(d, { day: null, time: "18:30" }, TODAY)).toEqual({ when: "2026-10-14T18:30", label: `${day(14)}, 6:30pm` });
    expect(moveWhen(d, { day: "2026-10-15", time: null }, TODAY)?.when).toBe("2026-10-15T09:00");
    expect(moveWhen(post({}), { day: null, time: null }, TODAY)).toBeNull();
    expect(moveWhen(d, { day: "2026-10-10", time: null }, TODAY)).toBeNull();
  });
});
