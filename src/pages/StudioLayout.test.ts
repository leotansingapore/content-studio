// StudioLayout wraps every page for everyone: its first frame must draw exactly as it did before Leo's app-open runs
// (pinned on today's code), and its effects must start nothing of Leo's for anyone else. Never update the pinned file
// with vitest -u.
//
// Node has no DOM, so effects never run in a server render. A small shim stands in for useState and useEffect inside
// StudioLayout's own body only (the PlanPage pin's pattern): each render collects the effects whose deps changed and
// the test runs them.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
const shim = vi.hoisted(() => ({ on: false, i: 0, e: 0, slots: [] as unknown[], deps: [] as (unknown[] | undefined)[], effects: [] as (() => unknown)[] }));
const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
const jobs = vi.hoisted(() => ({ runAutopilot: vi.fn(async () => undefined), startMorning: vi.fn(), autopilotWaiting: vi.fn(() => 0), onAutopilot: vi.fn(() => () => undefined) }));

vi.mock("react", async (actual) => {
  const real = await actual<typeof import("react")>();
  const useState = (init: unknown) => {
    if (!shim.on) return real.useState(init);
    const i = shim.i++;
    if (!(i in shim.slots)) shim.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [shim.slots[i], (v: unknown) => (shim.slots[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(shim.slots[i]) : v)];
  };
  // as React does: an effect runs again only when one of its deps changed (cleanups are not run)
  const useEffect = (fn: () => unknown, deps?: unknown[]) => {
    if (!shim.on) return real.useEffect(fn as () => void, deps);
    const k = shim.e++;
    const prev = shim.deps[k];
    if (deps && prev && deps.length === prev.length && deps.every((d, j) => Object.is(d, prev[j]))) return;
    shim.deps[k] = deps;
    shim.effects.push(fn);
  };
  return { ...real, default: { ...real, useState, useEffect }, useState, useEffect };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: async () => ({ data: { user: auth.user } }), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
// the sign-in's server checks: answered "off" with no network
vi.mock("@/lib/notify", async (actual) => ({ ...(await actual<typeof import("@/lib/notify")>()), refreshPushHere: async () => undefined }));
vi.mock("@/lib/socialConnect", async (actual) => ({ ...(await actual<typeof import("@/lib/socialConnect")>()), checkSocialConnect: async () => false }));
vi.mock("@/lib/market", async (actual) => ({ ...(await actual<typeof import("@/lib/market")>()), checkMarketEnabled: async () => false }));
vi.mock("@/lib/reelsBoard", async (actual) => ({ ...(await actual<typeof import("@/lib/reelsBoard")>()), checkMe: async () => Promise.reject(new Error("offline")) }));
// Leo's plan jobs: spies, so a run on anyone else's session shows up as a call
vi.mock("@/lib/autopilotJob", () => ({ runAutopilot: jobs.runAutopilot, onAutopilot: jobs.onAutopilot }));
vi.mock("@/lib/autopilot", () => ({ autopilotWaiting: jobs.autopilotWaiting }));
vi.mock("@/lib/ideasInbox", () => ({ startMorning: jobs.startMorning }));
// Leo's Remix sheet loads its own chunk; it is not this pin's
vi.mock("@/components/remix/RemixSheet", () => ({ default: () => null }));
vi.mock("@/components/remix/RemixPill", () => ({ default: () => null }));

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
vi.stubGlobal("window", {
  localStorage: local,
  location: new URL("http://localhost/home"),
  history: {},
  scrollY: 0,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  setInterval: () => 0,
  clearInterval() {},
});
vi.stubGlobal("document", { addEventListener() {}, removeEventListener() {}, visibilityState: "visible", activeElement: null });

const { default: StudioLayout } = await import("./StudioLayout");

// React's dev warnings call a component again outside the render to name it in a stack: that call must not
// touch the shim's state or effects
function Pinned() {
  const was = { on: shim.on, i: shim.i, e: shim.e, effects: shim.effects.length };
  shim.on = true;
  shim.i = 0;
  shim.e = 0;
  try {
    return StudioLayout();
  } catch (e) {
    shim.effects.length = was.effects;
    throw e;
  } finally {
    shim.on = was.on;
    shim.i = was.i;
    shim.e = was.e;
  }
}
const draw = (path: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Pinned)));

/** The first frame, then every effect the layout's own body set up, run in two rounds (the count waits for the
 * sign-in), each with a tick for its promises; returns the first frame and the one drawn after them. */
async function load(path = "/home") {
  shim.slots = [];
  shim.deps = [];
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

afterEach(() => {
  as.user = null;
  auth.user = null;
  local.clear();
  vi.clearAllMocks();
  jobs.autopilotWaiting.mockReturnValue(0);
});

describe("StudioLayout for everyone else", () => {
  it("draws today's first frame", async () => {
    await expect((await load()).first).toMatchFileSnapshot("./__pins__/studio-layout-everyone.html");
  });

  it("draws the same first frame while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect((await load()).first).toMatchFileSnapshot("./__pins__/studio-layout-everyone.html");
  });

  it("counts overdue posts on Pipeline and the phone Calendar tab, and nothing else, once signed in", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 22, 9, 0));
    auth.user = { id: UID, email: "someone@example.com" };
    local.setItem(
      `content-studio-drafts-${UID}`,
      JSON.stringify([
        { id: "a", createdAt: "2026-10-01T00:00:00Z", draft: "x", hook: "x", platform: "linkedin", status: "scheduled", scheduledFor: "2026-10-20T08:00" },
        { id: "b", createdAt: "2026-10-01T00:00:00Z", draft: "x", hook: "x", platform: "linkedin", status: "scheduled", scheduledFor: "2026-10-21" },
        { id: "c", createdAt: "2026-10-01T00:00:00Z", draft: "x", hook: "x", platform: "linkedin", status: "scheduled", scheduledFor: "2026-10-23" },
      ]),
    );
    const { loaded } = await load();
    vi.useRealTimers();
    expect(loaded.match(/, 2 need you/g)).toHaveLength(2);
    await expect(loaded).toMatchFileSnapshot("./__pins__/studio-layout-everyone-signed-in.html");
  });

  it("starts no autopilot run, no ideas set and no autopilot count, signed in or still being read", async () => {
    auth.user = { id: UID, email: "someone@example.com" };
    await load();
    as.user = undefined;
    await load();
    expect(jobs.runAutopilot).not.toHaveBeenCalled();
    expect(jobs.startMorning).not.toHaveBeenCalled();
    expect(jobs.autopilotWaiting).not.toHaveBeenCalled();
    expect(jobs.onAutopilot).not.toHaveBeenCalled();
  });
});

describe("StudioLayout for Leo", () => {
  const LEO = { id: UID, email: "tanjunsing@gmail.com" };
  const overdue = (id: string, day: string) => ({ id, createdAt: "2026-10-01T00:00:00Z", draft: "x", hook: "x", platform: "linkedin", status: "scheduled", scheduledFor: day });

  it("adds his autopilot posts waiting for an OK to the Pipeline count, read for today in Singapore", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T17:00:00Z")); // 01:00 on the 23rd in Singapore
    as.user = LEO;
    auth.user = LEO;
    jobs.autopilotWaiting.mockReturnValue(3);
    local.setItem(`content-studio-drafts-${UID}`, JSON.stringify([overdue("a", "2026-10-20T08:00")]));
    const { first, loaded } = await load();
    vi.useRealTimers();
    expect(first).not.toContain("need you");
    expect(loaded.match(/, 4 need you/g)).toHaveLength(2);
    expect(jobs.autopilotWaiting).toHaveBeenCalledWith(UID, "2026-10-23");
    expect(jobs.onAutopilot).toHaveBeenCalled();
  });

  it("runs autopilot and today's ideas once on load, for the open brand", async () => {
    as.user = LEO;
    auth.user = LEO;
    await load("/calendar");
    // a page change later does not run them again
    draw("/plan");
    for (const fn of shim.effects.splice(0)) fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(jobs.runAutopilot).toHaveBeenCalledTimes(1);
    expect(jobs.runAutopilot).toHaveBeenCalledWith(UID);
    expect(jobs.startMorning).toHaveBeenCalledTimes(1);
    expect(jobs.startMorning).toHaveBeenCalledWith(UID);
  });

  it("starts nothing while the sign-in is still being read", async () => {
    as.user = undefined;
    auth.user = LEO;
    await load();
    expect(jobs.runAutopilot).not.toHaveBeenCalled();
    expect(jobs.startMorning).not.toHaveBeenCalled();
  });
});
