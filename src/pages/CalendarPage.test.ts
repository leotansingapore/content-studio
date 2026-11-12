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

describe("Calendar's header, in Fastlane's order", () => {
  it("leads with the month, then the views, then quiet Filter and Add note, then the arrows around Today", () => {
    const out = html();
    const at = (s: string) => out.indexOf(s);
    expect(out).toMatch(/<h2 class="hidden [^"]*sm:block">October 2026<\/h2>/);
    expect(at(">October 2026</h2>")).toBeLessThan(at('aria-pressed="true"'));
    expect(at('aria-label="Previous month"')).toBeLessThan(at(">Today</button>"));
    expect(at(">Today</button>")).toBeLessThan(at('aria-label="Next month"'));
    // Filter and Add note wear no border at rest; the arrows and Today keep theirs, as Fastlane's do
    const filter = out.match(/<button type="button" aria-expanded="false" aria-controls="calendar-filters"[^>]*>/)![0];
    expect(filter).not.toMatch(/sm:hidden|\bborder\b/);
    expect(out).toMatch(/<button type="button" class="hidden [^"]*sm:inline-flex[^"]*">.*?Add note<\/button>/);
    expect(out.match(/<button type="button" class="hidden [^"]*sm:inline-flex[^"]*">/)![0]).not.toMatch(/\bborder\b/);
  });
  it("folds the platform and status filters behind one Filter button at every width, closed at first", () => {
    const out = html();
    expect(out).toMatch(/<div id="calendar-filters" class="hidden basis-full flex-wrap gap-2">/);
    expect(out.indexOf('aria-label="Platform"')).toBeGreaterThan(out.indexOf('id="calendar-filters"'));
    expect(out.indexOf('aria-label="Status"')).toBeGreaterThan(out.indexOf('id="calendar-filters"'));
    // Add note is not a filter: on phones its own quiet button sits under the calendar
    expect(out.indexOf("data-add-note-phone")).toBeGreaterThan(out.indexOf('aria-label="Previous month"'));
    expect(out).toMatch(/<button type="button" data-add-note-phone[^>]*sm:hidden[^>]*>.*?Add note<\/button>/);
  });
  it("shows This week as a line under the header, not a card", () => {
    expect(html()).toMatch(/<section aria-label="This week" class="space-y-1.5">/);
  });
  it("recommends 3 posting times a week", () => {
    expect(SLOT_DEFAULT).toBe(3);
    expect([...SLOT_CHOICES]).toEqual([3, 5, 7]);
  });
});
