// /calendar is live for everyone: its first frame must draw exactly as it did before publish-calendar's Leo-only parts
// (pinned on today's code). Never update the pinned file with vitest -u.
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

import CalendarPage, { SLOT_CHOICES, SLOT_DEFAULT } from "./CalendarPage";

const html = (path = "/calendar") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(CalendarPage)));

// the grid and This week read the clock: a fixed day
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 22, 9, 0));
});
afterAll(() => vi.useRealTimers());
afterEach(() => {
  as.user = null;
});

describe("Calendar for everyone else", () => {
  it("draws today's first frame", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/calendar-page-everyone.html");
  });
  it("draws today's first frame while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/calendar-page-everyone.html");
  });
  it("draws today's first frame on Leo's links", async () => {
    await expect(html("/calendar?platform=threads&schedule=1&step=when&fill=1#needs-you")).toMatchFileSnapshot("./__pins__/calendar-page-everyone.html");
  });
});

describe("Calendar's first screen on a phone", () => {
  it("folds the platform and status filters behind one Filter button, closed at first", () => {
    const out = html();
    expect(out).toMatch(/<button type="button" aria-expanded="false" aria-controls="calendar-filters"[^>]*sm:hidden[^>]*>.*?Filter<\/button>/);
    expect(out).toMatch(/<div id="calendar-filters" class="hidden gap-2 sm:contents">/);
    // both filters and Add note are inside the fold, the month arrows are not
    const fold = out.slice(out.indexOf('id="calendar-filters"'));
    expect(fold.indexOf('aria-label="Platform"')).toBeLessThan(fold.indexOf('aria-label="Previous month"'));
    expect(out.indexOf('aria-label="Platform"')).toBeGreaterThan(out.indexOf('id="calendar-filters"'));
    expect(out.indexOf("Add note")).toBeGreaterThan(out.indexOf('id="calendar-filters"'));
  });
  it("recommends 3 posting times a week", () => {
    expect(SLOT_DEFAULT).toBe(3);
    expect([...SLOT_CHOICES]).toEqual([3, 5, 7]);
  });
});
