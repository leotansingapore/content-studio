// The agent's screens drawn over the REAL engine's cards (agentPlans, agentRun): each case builds its card or message
// the way the engine does and checks the screen reads the field the engine writes. Drawn with renderToStaticMarkup.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({}) },
}));

// today's uses as the engine reads them on a press
const today = vi.hoisted(() => ({ used: {} as Record<string, number> }));
vi.mock("@/lib/aiUsage", async (actual) => {
  const real = await actual<typeof import("@/lib/aiUsage")>();
  return { ...real, readUsage: async () => ({ day: real.utcDay(), used: today.used }) };
});

const store = new Map<string, string>();
const ls = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("sessionStorage", ls);
vi.stubGlobal("window", { localStorage: ls, sessionStorage: ls, dispatchEvent: () => true, addEventListener() {}, removeEventListener() {}, location: new URL("http://localhost/") });

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
// Leo's stored session, so PriceChip draws his chip on the first frame
store.set("sb-abc-auth-token", JSON.stringify({ user: { id: UID, email: "tanjunsing@gmail.com" } }));
const { default: ActionCard, whoOption } = await import("./ActionCard");
const { competitorCard, fieldsOf, flagsFor, makeCard, withScript } = await import("@/lib/agentPlans");
const { default: MadeBlock } = await import("./MadeBlock");
const { saveDrafts } = await import("@/lib/draftHistory");
const { press } = await import("@/lib/agentRun");
const { loadThreads, newMsg, newThread } = await import("@/lib/agentThreads");
const { utcDay } = await import("@/lib/aiUsage");
import type { AgentCard } from "@/lib/agentCards";
import type { AgentMsg } from "@/lib/agentThreads";
import type { DraftEntry } from "@/lib/draftHistory";

const AT = "2026-10-22T10:00:00.000Z";
const draw = (card: AgentCard, o: { go?: AgentMsg["go"]; used?: Record<string, number> } = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ActionCard userId={UID} threadId="t1" msg={{ id: "m1", at: AT, role: "agent", card, go: o.go }} usage={o.used ? { day: utcDay(), used: o.used } : null} onSend={() => undefined} />
    </MemoryRouter>,
  );

describe("the competitor card", () => {
  it("starts with the link or @handle the engine took from the message in its box", () => {
    const { card } = competitorCard(UID, "add @finchcare as a competitor", "competitor", {});
    expect(draw(card!)).toMatch(/<input[^>]*value="@finchcare"/);
  });

  it("reads Add them from the box as typed, with the read's price, not from the empty input it was proposed with (replay D2)", () => {
    const { card } = competitorCard(UID, "add Finch as a competitor", "competitor", {});
    expect(draw(card!)).toContain("Type a name, a website or a social link.");
    // what was typed in the box this visit (the card keeps it in sessionStorage until the press)
    sessionStorage.setItem(`cs-agent-card-${card!.id}`, "Finch");
    const html = draw(card!);
    sessionStorage.removeItem(`cs-agent-card-${card!.id}`);
    expect(html).not.toContain("Type a name, a website or a social link.");
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>).)*Add them/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Add them/);
    // a name is looked up, so the press shows the read's price before it spends it
    expect(html).toContain("Add Finch as a competitor");
    expect(html).toContain("Under US$0.01");
  });
});

describe("a press the engine refuses", () => {
  const NO_VIDEOS = "No AI videos left today. Back at 8am Singapore time.";
  const video = () => makeCard(UID, { plan: "speaking", format: "speaking", act: "make", p: {}, topic: "CPF LIFE", speaker: { id: "mine", look: "" } });

  it("shows the line the engine left on the card, before the page reads today's uses itself, and its chips once", async () => {
    today.used = { "ai-video": 2 };
    const r = newThread(UID, [newMsg("user", { text: "make a video about CPF LIFE" }), newMsg("agent", { card: video() })]);
    if (r.ok === false) throw new Error(r.error);
    const m = r.item.messages[1];
    await press(UID, r.item.id, m.id, "approve");
    const after = loadThreads(UID)[0].messages[1];
    // the engine's side: still proposed, the line on the card, the cheaper chips under the message
    expect([after.card?.status, after.card?.error]).toEqual(["proposed", NO_VIDEOS]);
    expect(after.go?.map((g) => g.label)).toEqual(["Make the picture post", "Write the script"]);
    // the page's side, with its own read of today's uses not back yet (null)
    const html = draw(after.card!, { go: after.go });
    expect(html).toContain(NO_VIDEOS);
    // the chips are the message's, drawn under it by the thread: not a second set in the card, before or after the
    // page's own read of today's uses comes back short too
    expect(html).not.toContain("Make the picture post");
    expect(draw(after.card!, { go: after.go, used: { "ai-video": 2 } })).not.toContain("Make the picture post");
  });

  it("offers the engine's cheaper chips in the card when it is drawn short", () => {
    const html = draw(video(), { used: { "ai-video": 2 } });
    expect(html).toContain(NO_VIDEOS);
    expect(html).toContain("Make the picture post");
    expect(html).toContain("Write the script");
  });
});

describe("a talking video's Who appears", () => {
  it("selects the new AI presenter option for the engine's new presenter, and a saved one by its id", () => {
    // no face or presenter saved: the engine picks a new AI presenter
    const card = makeCard(UID, { plan: "speaking", format: "speaking", act: "make", p: {}, topic: "CPF LIFE", speaker: null });
    expect(fieldsOf(card).who).toBe("presenter");
    expect(whoOption(fieldsOf(card).who)).toBe("new");
    expect(["mine", "pr-1"].map(whoOption)).toEqual(["mine", "pr-1"]);
  });
});

describe("a flagged make", () => {
  it("shows its warning once: the engine's, on the card above the MADE block", () => {
    const words = "Guaranteed returns are a red flag.";
    // the draft as the remix saved it, with no answer from Jev's MAS question
    saveDrafts(UID, [{ id: "d1", hook: words, draft: words, createdAt: AT, remix: { keep: "", as: "carousel", close: "", flags: { copied: [], claim: false, invented: false, mas: null } } } as unknown as DraftEntry]);
    // the card as the engine's done() writes it
    const card: AgentCard = { ...makeCard(UID, { plan: "carousel", format: "carousel", act: "make", p: {}, topic: "guaranteed returns" }), status: "approved", flags: flagsFor(UID, words, null) };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ActionCard userId={UID} threadId="t1" msg={{ id: "m1", at: AT, role: "agent", card }} usage={null} onSend={() => undefined} />
        <MadeBlock userId={UID} job={{ kind: "remix", state: "done", drafts: ["d1"], open: "/carousel?draft=d1", title: words, startedAt: AT, endedAt: AT }} />
      </MemoryRouter>,
    );
    expect(card.flags).toHaveLength(1);
    expect(html.match(/is flagged\./g)).toHaveLength(1);
  });
});

describe("a talking video's second card", () => {
  it("says once that it takes a few minutes and opens in the video editor", () => {
    const script = "Most people never check what CPF LIFE will pay them. Here's where to see your own estimate. Log in, open the planner, and look at the monthly payout.";
    const card = withScript(UID, makeCard(UID, { plan: "speaking", format: "speaking", act: "make", p: {}, topic: "CPF LIFE", speaker: null }), script);
    expect(card.step).toBe("video");
    expect(draw(card).match(/It takes a few minutes and opens in the video editor\./g)).toHaveLength(1);
  });
});

describe("a talking video's first card", () => {
  it("prices Write the script without counting the video it doesn't spend yet", () => {
    const card = makeCard(UID, { plan: "speaking", format: "speaking", act: "make", p: {}, topic: "CPF LIFE", speaker: null });
    expect([card.step, card.needs[0].feature]).toEqual(["script", "ai-video"]);
    const html = draw(card, { used: {} });
    expect(html).toContain("2 of 2 videos left today");
    expect(html).not.toContain("left after this");
  });
});

describe("a failed card (replay D8)", () => {
  const failed = (o: Partial<AgentCard>): AgentCard => ({ ...makeCard(UID, { plan: "post", format: "post", act: "make", p: {}, topic: "CPF LIFE" }), status: "failed", error: "This one didn't go through.", ...o });
  it("says the use was given back only when the engine marked it so", () => {
    expect(draw(failed({ refunded: true }))).toContain("Your use was given back.");
    expect(draw(failed({}))).not.toContain("Your use was given back.");
    expect(draw(failed({ error: "The post didn't name ActivityTracker once." }))).not.toContain("Your use was given back.");
  });
});

describe("a MADE block's Schedule it (phase 7a)", () => {
  const made = (draft: Partial<DraftEntry>) => {
    saveDrafts(UID, [{ id: "d1", hook: "CPF at 55", draft: "CPF at 55", createdAt: AT, agent: { thread: "t1", msg: "m1" }, ...draft } as DraftEntry]);
    return renderToStaticMarkup(
      <MemoryRouter>
        <MadeBlock userId={UID} job={{ kind: "remix", state: "done", drafts: ["d1"], open: "/generate?draft=d1", title: "CPF at 55", startedAt: AT, endedAt: AT }} />
      </MemoryRouter>,
    );
  };
  it("shows on a made post not yet scheduled", () => {
    expect(made({})).toContain(">Schedule it<");
  });
  it("goes once Zernio holds the post or it is linked to its live post, as Next up's made row does", () => {
    expect(made({ zernio: { key: "k", postId: "z1", status: "scheduled", at: AT } as DraftEntry["zernio"] })).not.toContain("Schedule it");
    expect(made({ live: { postId: "ig-1", platform: "instagram", url: null, by: "jev" } as DraftEntry["live"] })).not.toContain("Schedule it");
  });
  it("goes once the post is marked posted, with no Zernio link (live-p7a D19)", () => {
    expect(made({ status: "posted", postedAt: AT })).not.toContain("Schedule it");
    expect(made({ status: "scheduled", scheduledFor: "2026-10-30T09:00" })).toContain(">Schedule it<");
  });
});
