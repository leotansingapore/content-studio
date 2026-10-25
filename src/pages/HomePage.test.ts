// Home is live for everyone: its first frame must draw exactly as it did before Leo's goal line (pinned on
// today's code). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import HomePage from "./HomePage";

const html = (path = "/home") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(HomePage)));

// the greeting reads the clock: a fixed morning
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 22, 9, 0));
});
afterAll(() => vi.useRealTimers());
afterEach(() => {
  as.user = null;
  delete (globalThis as { window?: unknown }).window;
});

describe("Home for everyone else", () => {
  it("draws today's first frame", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/home-page-everyone.html");
  });
  it("draws today's first frame while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/home-page-everyone.html");
  });
  it("draws today's first frame on a goal link", async () => {
    await expect(html("/home?goal=change")).toMatchFileSnapshot("./__pins__/home-page-everyone.html");
  });
});

describe("Home for Leo", () => {
  const UID = "40f07a18-0000-4000-8000-000000000001";
  const leo = (rows: Record<string, unknown> = {}) => {
    as.user = { id: UID, email: "tanjunsing@gmail.com" };
    const m = new Map(Object.entries(rows).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
    (globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: () => undefined } };
  };
  const mine = (goal: Record<string, unknown>) => ({ [`content-studio-positioning-${UID}`]: { topics: ["CPF"], cadence: 5, ...goal } });

  it("shows the GOAL line under the greeting, empty", () => {
    leo();
    const out = html();
    expect(out).toMatch(/<\/h1><div class="mt-2 space-y-3">/);
    expect(out).toContain("Set a goal for this brand");
    expect(out).toContain(">Set goal</button>");
    expect(out).toContain('aria-label="About the goal"');
  });

  it("shows the saved goal with Change", () => {
    leo(mine({ goal: "More people booking a 15-minute review with me", goalKind: "clients" }));
    const out = html();
    expect(out).toContain("More people booking a 15-minute review with me");
    expect(out).toContain(">Change</button>");
    expect(out).not.toContain("What should posting do for you?");
  });

  it("opens the editor on ?goal=change with the five chips, the saved goal's chip picked", () => {
    leo(mine({ goal: "Grow an audience that knows what I do", goalKind: "audience" }));
    const out = html("/home?goal=change");
    expect(out).toContain("What should posting do for you?");
    for (const c of ["Get more enquiries from people I can help", "Keep in touch with clients so they refer me", "Find people to join my team", "Post every week without it taking my evenings"]) expect(out).toContain(c);
    expect(out).toMatch(/aria-checked="true"[^>]*>.*?Grow an audience that knows what I do<\/button>/);
    expect(out).toContain('maxLength="120"');
    expect(out).toContain(">Save goal</button>");
    expect(out).not.toContain(">Change</button>");
  });

  it("shows Pace in place of the This week card, the streak still beside it", () => {
    const posted = { id: "d1", draft: "A post", platform: "tiktok", createdAt: "2026-10-20T01:00:00Z", status: "posted", postedAt: "2026-10-20T01:00:00Z" };
    leo({ [`content-studio-drafts-${UID}`]: [posted], [`content-studio-goals-${UID}`]: { tiktok: 3 } });
    const out = html();
    expect(out).toContain('<section id="pace"');
    expect(out).toContain("1 of 3 this week");
    expect(out).toContain('aria-label="Edit weekly goal"');
    expect(out).not.toContain(">This week<");
    expect(out).toContain("lucide-flame");
  });

  it("shows the open brand's own goal, worded for a business when it speaks as one", () => {
    leo({
      [`content-studio-profiles-${UID}`]: [{ id: "at", name: "ActivityTracker", createdAt: "" }],
      [`cs-active-profile-${UID}`]: "at",
      ...mine({ goal: "Mine, not this brand's", goalKind: "clients" }),
      [`content-studio-positioning-${UID}~at`]: { goal: "Get more sign-ups and enquiries", goalKind: "clients" },
    });
    const out = html("/home?goal=change");
    expect(out).not.toContain("Mine, not this brand&#x27;s");
    expect(out).toContain("Grow an audience that knows what we do");
    expect(out).toMatch(/aria-checked="true"[^>]*>.*?Get more sign-ups and enquiries<\/button>/);
  });
});
