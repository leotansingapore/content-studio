// Winner found (remix-own-winners): the winner line, and each card state's heading and buttons. Nothing is made
// on a render: versions start only on the press of Make 3 versions.
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";
import type { WinnerCard as Card } from "@/lib/winners";

const as = vi.hoisted(() => ({ cards: [] as unknown[], made: 0 }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoOnly: () => true }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/winners", () => ({
  winnerCards: () => as.cards,
  checkWinners: () => Promise.resolve(),
  onWinners: () => () => undefined,
  makeWinnerVersions: () => {
    as.made++;
    return "started";
  },
  undoWinner: () => 0,
}));

const { default: WinnerCard, undoToast, winnerLine } = await import("./WinnerCard");

const draft = { id: "w1", hook: "5 things I wish I knew before my first CPF top-up", draft: "5 things I wish I knew before my first CPF top-up\n\nOne.", platform: "linkedin" } as DraftEntry;
const card = (status: Card["status"], o: Partial<Card> = {}): Card => ({ winner: { draft, network: "linkedin", engagements: 240, usual: 100, ratio: 2.4 }, status, ...o });
const html = (cards: Card[]) => {
  as.cards = cards;
  return renderToStaticMarkup(
    <MemoryRouter>
      <WinnerCard userId="u1" drafts={[draft]} now={() => 0} />
    </MemoryRouter>,
  );
};

afterEach(() => {
  as.cards = [];
});

describe("Winner found", () => {
  it("says what Undo took and what it kept (live-p7a D18)", () => {
    expect(undoToast(3, 3)).toEqual({ title: "3 versions removed" });
    expect(undoToast(3, 2)).toEqual({ title: "2 versions removed", description: "The one you changed or scheduled stays." });
    expect(undoToast(3, 1)).toEqual({ title: "1 version removed", description: "The 2 you changed or scheduled stay." });
    expect(undoToast(3, 0)).toEqual({ title: "Those versions were changed or scheduled, so they stay." });
  });
  it("names the post, the ratio and the network", () => {
    expect(winnerLine(card("ready"))).toBe('"5 things I wish I knew before my first CPF top-up" got 2.4x your usual engagement on LinkedIn.');
    expect(winnerLine({ ...card("ready"), winner: { ...card("ready").winner, usual: 0, ratio: null } })).toBe('"5 things I wish I knew before my first CPF top-up" got 240 engagements on LinkedIn.');
  });
  it("draws nothing without a winner", () => {
    expect(html([])).toBe("");
  });
  it("offers Make 3 versions with its price on a checked winner, and makes nothing on a render", () => {
    const out = html([card("ready")]);
    expect(out).toContain('id="winners"');
    expect(out).toContain(">Winner found</h3>");
    expect(out).toContain('aria-label="About Winner found"');
    expect(out).toContain(">Make 3 versions</button>");
    expect(out).toContain("Under US$0.01");
    expect(as.made).toBe(0);
  });
  it("offers Make 3 versions when the day's checks are used", () => {
    expect(html([card("limit")])).toContain(">Make 3 versions</button>");
  });
  it("shows the run, then See the versions and Undo, or Try again", () => {
    expect(html([card("making")])).toContain(">Winner found. Making 3 versions...</h3>");
    expect(html([card("making")])).not.toContain("Make 3 versions</button>");
    const made = html([card("made", { setId: "vs-abc", versions: 3, undo: true })]);
    expect(made).toContain(">Winner found. 3 versions made.</h3>");
    expect(made).toContain('href="/drafts?set=vs-abc"');
    expect(made).toContain(">Undo</button>");
    // live-p7a D18: an Undo that kept the one you edited leaves that count, and no second Undo
    const kept = html([card("made", { setId: "vs-abc", versions: 1, undo: false })]);
    expect(kept).toContain(">Winner found. 1 version made.</h3>");
    expect(kept).toContain('href="/drafts?set=vs-abc"');
    expect(kept).not.toContain(">Undo</button>");
    const failed = html([card("failed")]);
    expect(failed).toContain(">Winner found. Couldn&#x27;t make the versions.</h3>");
    expect(failed).toContain(">Try again</button>");
  });
});
