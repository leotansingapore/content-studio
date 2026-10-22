// The agent's screens drawn over the REAL engine's cards (agentPlans, agentRun): each case builds its card or message
// the way the engine does and checks the screen reads the field the engine writes. Drawn with renderToStaticMarkup.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({}) },
}));

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

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const { default: ActionCard } = await import("./ActionCard");
const { competitorCard } = await import("@/lib/agentPlans");
import type { AgentCard } from "@/lib/agentCards";

const draw = (card: AgentCard) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ActionCard userId={UID} threadId="t1" msg={{ id: "m1", at: "2026-10-22T10:00:00.000Z", role: "agent", card }} usage={null} onSend={() => undefined} />
    </MemoryRouter>,
  );

describe("the competitor card", () => {
  it("starts with the link or @handle the engine took from the message in its box", () => {
    const { card } = competitorCard(UID, "add @finchcare as a competitor", "competitor", {});
    expect(draw(card!)).toMatch(/<input[^>]*value="@finchcare"/);
  });
});
