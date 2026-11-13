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
  it("shows This week on the one status line between the header and the grid, not a card", () => {
    const out = html();
    expect(out).toMatch(/<div data-status-line="true" class="flex flex-wrap [^"]*"><section aria-label="This week" class="flex flex-wrap [^"]*">/);
    expect(out.indexOf("data-status-line")).toBeGreaterThan(out.indexOf('id="calendar-filters"'));
    expect(out.indexOf("data-status-line")).toBeLessThan(out.indexOf('aria-label="Month calendar"'));
    expect(out).toContain(">This week:</span>");
  });
  it("keeps the page heading for screen readers at every width: the tab row already says Calendar", () => {
    expect(html()).toMatch(/<header class="sr-only"><h1[^>]*>Calendar<\/h1><\/header>/);
  });
  it("recommends 3 posting times a week", () => {
    expect(SLOT_DEFAULT).toBe(3);
    expect([...SLOT_CHOICES]).toEqual([3, 5, 7]);
  });
});

// today is Thu 22 Oct 2026: October's grid runs Mon 28 Sep to Sun 8 Nov
describe("Calendar's days", () => {
  const adds = (out: string) =>
    [...out.matchAll(/<a [^>]*aria-label="Add a post on ([^"]+)"[^>]*>/g)].map((m) => ({ label: m[1], day: m[0].match(/href="\/generate\?day=(\d{4}-\d{2}-\d{2})"/)?.[1] }));
  const cell = (out: string, day: string) => out.match(new RegExp(`<div data-day="${day}"[^>]*class="([^"]*)"`))![1];

  it("offers Add on today and every later day of the month grid, named by its date, and on no past day", () => {
    const found = adds(html());
    expect(found).toHaveLength(18);
    expect(found[0].day).toBe("2026-10-22");
    expect(found[0].label).toMatch(/22/);
    expect(found.every((a) => a.day! >= "2026-10-22")).toBe(true);
    expect(new Set(found.map((a) => a.day)).size).toBe(18);
  });
  it("offers Add from today on in the week view", () => {
    expect(adds(html("/calendar?view=week")).map((a) => a.day)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  });
  it("offers no Add in Upcoming", () => {
    expect(adds(html("/calendar?view=upcoming"))).toHaveLength(0);
  });
  it("dims past days and labels today, in both grids", () => {
    for (const out of [html(), html("/calendar?view=week")]) {
      expect(cell(out, "2026-10-21")).toContain("bg-muted/40");
      expect(cell(out, "2026-10-22")).toContain("bg-card");
      expect(out.match(/>Today<\/span>/g)).toHaveLength(1);
      expect(out).toMatch(/aria-label="Open [^"]*22[^"]*, today"/);
    }
  });
});
