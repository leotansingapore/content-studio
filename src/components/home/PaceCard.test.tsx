// Pace on Leo's Home (learn-pace): each state drawn from props, the pencil and Try again pressed in the element tree
// PaceView returns (it has no hooks, so Node can call it), and the card's own reads of the synced keys.
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPace, recordPull, type PaceState } from "@/lib/pace";
import type { MetricsPost, Numbers } from "@/lib/realNumbers";
import PaceCard, { FAILED_LINE, PaceView, updatedLine, type PaceProps } from "./PaceCard";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 10:00 on 1 Oct 2026 in Singapore
const T0 = Date.parse("2026-10-01T02:00:00Z");
const iso = (t: number) => new Date(t).toISOString();
const n = (views: number): Numbers => ({ impressions: 0, reach: 0, views, likes: 0, comments: 0, shares: 0, saves: 0 });
const post = (id: string, views: number, publishedAt = "2026-09-01T00:00:00Z"): MetricsPost =>
  ({ id, zernioPostId: null, platform: "tiktok", accountId: "65000000000000000000a001", publishedAt, text: "", url: null, numbers: n(views) });
const pulls = (...steps: [number, MetricsPost[]][]): PaceState => steps.reduce((s, [t, posts]) => recordPull(s, posts, iso(t)), emptyPace());

// post A 100 then 160 views, new post B 50: 110 views a day
const DONE = pulls([T0, [post("a", 100)]], [T0 + DAY, [post("a", 160), post("b", 50, iso(T0 + 2 * HOUR))]]);

const base = (): PaceProps => ({
  pace: DONE,
  job: { running: false, error: null },
  connected: true,
  paused: false,
  week: { posted: 3, goal: 5, scheduled: 2 },
  goalHit: false,
  runs: { total: 14, most: { feature: "reel-clone", n: 6 } },
  now: T0 + DAY + 5 * 60_000,
  onEditGoal: vi.fn(),
  onRetry: vi.fn(),
});
const html = (p: Partial<PaceProps> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PaceView {...base()} {...p} />
    </MemoryRouter>,
  ).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

type El = ReactElement<Record<string, unknown> & { children?: unknown }>;
const kids = (x: unknown): unknown[] => (x == null || typeof x === "boolean" ? [] : Array.isArray(x) ? x.flatMap(kids) : [x]);
const text = (x: unknown): string => (typeof x === "string" || typeof x === "number" ? String(x) : isValidElement(x) ? kids((x as El).props.children).map(text).join("") : "");
function find(tree: unknown, ok: (el: El) => boolean): El | null {
  if (!isValidElement(tree)) return null;
  if (ok(tree as El)) return tree as El;
  for (const c of kids((tree as El).props.children)) {
    const hit = find(c, ok);
    if (hit) return hit;
  }
  return null;
}

describe("Pace's views a day", () => {
  it("shows 110 views a day from pulls 24 hours apart, linked to the real numbers, with the time it was read", () => {
    const out = html();
    expect(out).toContain(" 110 views a day, last 7 days");
    expect(out).toContain("Updated 10:00 AM");
    expect(renderToStaticMarkup(<MemoryRouter><PaceView {...base()} /></MemoryRouter>)).toContain('href="/analytics#real-numbers"');
    expect(out).not.toContain("usual");
  });

  it("counts from today on the first pull, and shows the tomorrow line", () => {
    const out = html({ pace: pulls([T0, [post("a", 100)]]), now: T0 + HOUR });
    expect(out).toContain("Counting from today. Views a day shows tomorrow.");
    expect(out).not.toContain("views a day, last 7 days");
  });

  it("reads 0 with No views yet when nothing gained", () => {
    const out = html({ pace: pulls([T0, [post("a", 100)]], [T0 + DAY, [post("a", 100)]]) });
    expect(out).toContain(" 0 No views yet.");
  });

  it("never drops when a post is deleted", () => {
    const pace = pulls([T0, [post("a", 100), post("gone", 900)]], [T0 + DAY, [post("a", 160), post("b", 50, iso(T0 + 2 * HOUR))]]);
    expect(html({ pace })).toContain(" 110 views a day");
  });

  it("shows the change on the usual and ticks it on the gauge from 35 days of history, the 28-day average", () => {
    // pulls at midnight Singapore time put each day's gain on that day: 100 a day for the 28 days before the window,
    // then 150 a day: +50%
    const MIDNIGHT = T0 - 10 * HOUR;
    const steps: [number, MetricsPost[]][] = [];
    let views = 0;
    for (let d = 0; d <= 35; d++) {
      steps.push([MIDNIGHT + d * DAY, [post("a", views)]]);
      views += d < 29 ? 100 : 150;
    }
    const out = html({ pace: pulls(...steps), now: MIDNIGHT + 35 * DAY });
    expect(out).toContain(" 150 views a day, last 7 days +50% on your usual");
    expect(out).toContain(" usual ");
    // the gauge runs to twice the usual (200) with the needle past the tick
    expect(renderToStaticMarkup(<MemoryRouter><PaceView {...base()} pace={pulls(...steps)} /></MemoryRouter>)).toContain('aria-label="150 on a scale to 200, usual 100"');
  });

  it("says it's reading before any pace is stored, and asks for an account when none is connected", () => {
    expect(html({ pace: emptyPace() })).toContain("Reading your views...");
    const off = html({ pace: emptyPace(), connected: false });
    expect(off).toContain("Connect an account to see views a day. Connect an account");
    expect(renderToStaticMarkup(<MemoryRouter><PaceView {...base()} connected={false} /></MemoryRouter>)).toContain('href="/accounts"');
    // posts out and AI runs still show
    expect(off).toContain("3 of 5 this week");
    expect(off).toContain("Most: reel clone (6)");
  });

  it("keeps the number with Updating... while a pull is out, and dates a read over a day old", () => {
    expect(html({ job: { running: true, error: null } })).toMatch(/Updating\.\.\. 110 views a day/);
    expect(html({ now: T0 + 3 * DAY })).toContain("Updated Fri 2 Oct");
    expect(updatedLine(iso(T0 + 13 * HOUR), T0 + 14 * HOUR)).toBe("Updated 11:00 PM");
  });

  it("keeps the last number under each failure, with the server's own line for 402 and 429", () => {
    const failed = { message: "Couldn't read your numbers. Try again in a minute.", code: "", status: 0 };
    expect(html({ job: { running: false, error: failed } })).toContain(`110 views a day, last 7 days ${FAILED_LINE} Try again`);
    const p = { ...base(), job: { running: false, error: failed } };
    const retry = find(PaceView(p), (e) => text(e) === "Try again" && typeof e.props.onClick === "function");
    (retry!.props.onClick as () => void)();
    expect(p.onRetry).toHaveBeenCalledOnce();

    const plan = { message: "Analytics isn't on this Zernio plan.", code: "no_analytics", status: 402 };
    const capped = { message: "You've used today's 300 reads. More tomorrow.", code: "daily_limit", status: 429 };
    expect(html({ job: { running: false, error: plan } })).toContain("110 views a day, last 7 days Analytics isn't on this Zernio plan.");
    expect(html({ job: { running: false, error: capped } })).toContain("110 views a day, last 7 days You've used today's 300 reads. More tomorrow.");
    expect(html({ job: { running: false, error: capped } })).not.toContain("Try again");
    // a 402 pause outlives the job across a reload
    expect(html({ paused: true })).toContain("Analytics isn't on this Zernio plan.");
    // a first pull that failed: no number to keep
    expect(html({ pace: emptyPace(), job: { running: false, error: failed } })).toContain(` - ${FAILED_LINE} Try again`);
  });
});

describe("Pace's posts out and AI runs", () => {
  it("reads the week against the goal: booked, goal hit, nothing booked; no goal shows the link", () => {
    expect(html()).toContain("POSTS OUT 3 of 5 this week 2 booked");
    expect(html({ week: { posted: 5, goal: 5, scheduled: 1 }, goalHit: true })).toContain("5 of 5 this week Goal hit");
    expect(html({ week: { posted: 0, goal: 5, scheduled: 0 } })).toContain("0 of 5 this week Nothing booked yet");
    const none = html({ week: { posted: 2, goal: 0, scheduled: 0 } });
    expect(none).toContain("2 this week Set a weekly goal");
    expect(renderToStaticMarkup(<MemoryRouter><PaceView {...base()} /></MemoryRouter>)).toContain('href="/calendar?view=week"');
  });

  it("opens the goal editor from the pencil, and from Set a weekly goal with none", () => {
    const p = base();
    const pencil = find(PaceView(p), (e) => e.props["aria-label"] === "Edit weekly goal");
    (pencil!.props.onClick as () => void)();
    expect(p.onEditGoal).toHaveBeenCalledOnce();
    const q = { ...base(), week: { posted: 0, goal: 0, scheduled: 0 } };
    expect(find(PaceView(q), (e) => e.props["aria-label"] === "Edit weekly goal")).toBeNull();
    (find(PaceView(q), (e) => text(e) === "Set a weekly goal")!.props.onClick as () => void)();
    expect(q.onEditGoal).toHaveBeenCalledOnce();
  });

  it("shows the week's AI runs with the most used, and Couldn't read when the rows can't be read", () => {
    expect(html()).toContain("AI RUNS, LAST 7 DAYS 14 Most: reel clone (6)");
    expect(html({ runs: { total: 0, most: null } })).toMatch(/AI RUNS, LAST 7 DAYS 0 $/);
    expect(html({ runs: null })).toContain("AI RUNS, LAST 7 DAYS - Couldn't read");
  });
});

describe("Pace's own reads", () => {
  const UID = "40f07a18-0000-4000-8000-000000000001";
  const seed = (rows: Record<string, unknown>) => {
    const m = new Map(Object.entries(rows).map(([k, v]) => [k, JSON.stringify(v)]));
    const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: () => undefined };
    Object.assign(globalThis, { window: { localStorage: ls, addEventListener: () => undefined }, localStorage: ls });
  };
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  const card = () =>
    renderToStaticMarkup(
      <MemoryRouter>
        <PaceCard userId={UID} week={{ posted: 1, goal: 0, scheduled: 0 }} goalHit={false} onEditGoal={() => undefined} />
      </MemoryRouter>,
    ).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const on = { "cs-social-connect": { on: true, at: Date.now() } };

  it("reads the open brand's synced pace", () => {
    seed({ ...on, [`content-studio-pace-${UID}`]: DONE, [`content-studio-realnumbers-${UID}`]: { on: true, at: iso(T0 + DAY), notMine: [] } });
    expect(card()).toContain(" 110 views a day");
  });

  it("asks for an account after a pull that found none, rather than reading forever", () => {
    seed({ ...on, [`content-studio-realnumbers-${UID}`]: { on: true, at: new Date().toISOString(), notMine: [] } });
    expect(card()).toContain("Connect an account to see views a day.");
    seed(on);
    expect(card()).toContain("Reading your views...");
  });

  it("shows the plan line while a 402 pause holds, and asks for an account when social accounts are off", () => {
    seed({ ...on, [`content-studio-pace-${UID}`]: DONE, [`content-studio-realnumbers-${UID}`]: { on: true, at: iso(T0 + DAY), notMine: [], pausedUntil: new Date(Date.now() + HOUR).toISOString() } });
    expect(card()).toContain("Analytics isn't on this Zernio plan.");
    seed({ [`content-studio-pace-${UID}`]: DONE });
    expect(card()).toContain("Connect an account to see views a day.");
  });
});
