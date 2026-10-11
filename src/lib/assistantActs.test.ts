import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DockAct, DockDone } from "@/components/feedback/AssistantDock";
import { actFor, pastedPart, postsForJev, proposeAct } from "@/lib/assistantActs";
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
  vi.stubGlobal("window", { localStorage, location: { pathname: "/home" } });
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
    expect(c.ask).toBe('Paste this into Engage > Comments on my post? It replaces what is there now.\n"Sarah: Mine went up too"');
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
    expect(thread.ask.startsWith("Paste this into Engage > My DMs, one conversation?\n")).toBe(true);
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
