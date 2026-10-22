// /plan is live for everyone: with a saved plan its plan view must draw exactly as it did before Leo's pillars (pinned
// on today's code). Never update the pinned files with vitest -u.
//
// Node has no DOM, so effects never run in a server render, and the page reads its plan in an effect. A small shim
// stands in for useState and useEffect inside PlanPage's own body only: the first render collects its effects, the
// test runs them (the plan loads from a fake localStorage), and the second render draws from the state they set.
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
const shim = vi.hoisted(() => ({ on: false, i: 0, slots: [] as unknown[], effects: [] as (() => unknown)[] }));

vi.mock("react", async (actual) => {
  const real = await actual<typeof import("react")>();
  const useState = (init: unknown) => {
    if (!shim.on) return real.useState(init);
    const i = shim.i++;
    if (!(i in shim.slots)) shim.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [shim.slots[i], (v: unknown) => (shim.slots[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(shim.slots[i]) : v)];
  };
  const useEffect = (fn: () => unknown, deps?: unknown[]) => (shim.on ? void shim.effects.push(fn) : real.useEffect(fn as () => void, deps));
  return { ...real, default: { ...real, useState, useEffect }, useState, useEffect };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: UID } } }), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) },
  },
}));
// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), PIPELINE_TABS: [] }));

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const local = new MemStorage();
vi.stubGlobal("localStorage", local);
vi.stubGlobal("sessionStorage", new MemStorage());
vi.stubGlobal("window", { localStorage: local, location: new URL("http://localhost/plan"), addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });

const { default: PlanPage } = await import("./PlanPage");
const { generatePlan } = await import("@/lib/contentPlan");
const { EMPTY_POSITIONING } = await import("@/lib/positioning");

const POSITIONING = {
  ...EMPTY_POSITIONING,
  oneLiner: "I help young parents protect their income without overpaying.",
  audienceDetail: "parents of kids under 7",
  topics: ["CPF top-ups", "Critical illness", "Hospital plans"],
  edge: "Ex-nurse turned adviser",
  platform: "instagram" as const,
  cadence: 4,
};
const PLAN = {
  ...generatePlan(POSITIONING, { weeks: 2, salt: 0 }),
  id: "plan-pin",
  createdAt: "2026-01-05T00:00:00.000Z",
  thisWeek: "A client asked if her company cover is enough.",
};
PLAN.items[1] = { ...PLAN.items[1], posted: true };

function seed(o: { labels?: boolean } = {}) {
  local.clear();
  local.setItem(`content-studio-positioning-${UID}`, JSON.stringify(POSITIONING));
  local.setItem(`content-studio-plan-${UID}`, JSON.stringify(PLAN));
  local.setItem(
    `content-studio-drafts-${UID}`,
    JSON.stringify([{ id: `plan_${PLAN.items[2].id}`, createdAt: "2026-01-05T00:00:00.000Z", hook: "h", draft: "Written", pillar: "topic", pillarDetail: "", audience: "", format: "carousel", platform: "instagram", ctaType: "", status: "posted", postedAt: "2026-01-07T02:00:00.000Z" }]),
  );
  if (o.labels) local.setItem(`content-studio-labels-${UID}`, JSON.stringify([{ id: "t-cpf-top-ups", name: "CPF top-ups", color: "primary", target: 50 }, { id: "lx", name: "Retirement", color: "brand", target: 50 }]));
}

// React's dev warnings call a component again outside the render to name it in a stack: that call must not
// touch the shim's state or effects
function Pinned() {
  const was = { on: shim.on, i: shim.i, effects: shim.effects.length };
  shim.on = true;
  shim.i = 0;
  try {
    return PlanPage();
  } catch (e) {
    shim.effects.length = was.effects;
    throw e;
  } finally {
    shim.on = was.on;
    shim.i = was.i;
  }
}
const draw = (path: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Pinned)));

/** The first frame, then the frame after the page's effects have read the stores (two rounds: Leo's labels load once the user is known). */
async function frames(path = "/plan") {
  shim.slots = [];
  shim.effects = [];
  const first = draw(path);
  let loaded = first;
  for (let round = 0; round < 2; round++) {
    for (const fn of shim.effects.splice(0)) fn();
    await new Promise((r) => setTimeout(r, 0));
    shim.effects = [];
    loaded = draw(path);
  }
  return { first, loaded };
}

// React's generated ids (useId, behind the Radix selects) follow the tree, not what is drawn
const sha = (s: string) => createHash("sha256").update(s.replace(/radix-:[A-Za-z0-9]+:/g, "radix-id")).digest("hex");

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.42); // the quick tip is picked at random
});
afterEach(() => {
  as.user = null;
  vi.restoreAllMocks();
});

describe("/plan for everyone else", () => {
  it("draws today's plan view for a saved plan", async () => {
    seed();
    const { loaded } = await frames();
    expect(loaded).toContain("Draft in Studio");
    await expect(loaded).toMatchFileSnapshot("./__pins__/plan-page-everyone.html");
  });

  it("draws the same plan view with saved labels, while the sign-in is read, and with Leo's params", async () => {
    seed({ labels: true });
    const { loaded } = await frames("/plan?pillars=edit#pillars");
    await expect(loaded).toMatchFileSnapshot("./__pins__/plan-page-everyone.html");
    as.user = undefined;
    seed({ labels: true });
    await expect((await frames()).loaded).toMatchFileSnapshot("./__pins__/plan-page-everyone.html");
  });

  it("draws today's first frame, before the stores are read", async () => {
    seed({ labels: true });
    const { first } = await frames();
    expect(first).toContain("Build my content plan");
    expect(sha(first)).toBe("cd60e395638d9df71d4d608765389d8063d279b087af681cbbda06d621dd4b69");
  });
});

describe("/plan for Leo", () => {
  const LEO = { id: UID, email: "tanjunsing@gmail.com" };

  it("shows the Pillars section and the label each slot counts toward", async () => {
    as.user = LEO;
    seed({ labels: true });
    const { loaded } = await frames();
    expect(loaded).toContain('id="pillars"');
    expect(loaded).toContain('aria-label="About pillars"');
    expect(loaded).toContain("aim 50%");
    expect(loaded).toContain("posted in the last 4 weeks | in this plan");
    expect(loaded).not.toContain("These come from your topics.");
    // a slot about CPF top-ups wears the saved label by name, and takes it into Write
    expect(loaded).toContain(">Change</button>");
    expect(loaded).toMatch(/href="\/generate\?[^"]*ctx=[^"]*label=t-cpf-top-ups"[^>]*>Draft in Studio/);
    // an empty cell links to Write with the pillar, format and label set
    expect(loaded).toContain('aria-label="Write a text post about Retirement"');
    expect(loaded).toContain('href="/generate?pillar=topic&amp;detail=Retirement&amp;format=text-post&amp;label=lx"');
  });

  it("counts seeded labels from the topics until labels are saved", async () => {
    as.user = LEO;
    seed();
    const { loaded } = await frames();
    expect(loaded).toContain("These come from your topics. Set an aim for each to steer the plan.");
    expect(loaded).toContain("aim 33%");
  });

  it("opens the edit panel from ?pillars=edit", async () => {
    as.user = LEO;
    seed({ labels: true });
    const { loaded } = await frames("/plan?pillars=edit");
    expect(loaded).toContain("Save and rebuild plan");
    expect(loaded).toContain("Adds up to 100%");
    expect(loaded).not.toContain("They don&#x27;t need to add up to 100.");
    expect(loaded).not.toContain(">Edit pillars<");
  });
});
