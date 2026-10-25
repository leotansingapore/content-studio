// What wins for you (learn-format-winners): the card's first frame for each state, drawn on the server. The tag job,
// try-next and the niche figures run in effects, which a server render never runs, so this file also proves the first
// frame makes no call; the browser harness covers what arrives after.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";
import type { TagJob } from "@/lib/formatWinners";

const as = vi.hoisted(() => {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = ls;
  (globalThis as { window?: unknown }).window = { localStorage: ls, dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined };
  return { user: null as null | undefined | { id: string; email: string }, job: null as TagJob | null, store };
});
const callFn = vi.fn();
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
vi.mock("@/lib/formatWinners", async (actual) => {
  const real = await actual<typeof import("@/lib/formatWinners")>();
  return { ...real, tagJob: (uid: string) => as.job ?? real.tagJob(uid) };
});

import WhatWins from "./WhatWins";
import { makeAnotherUrl, saveTags, subLine, tryItUrl } from "@/lib/formatWinners";
import { saveDrafts } from "@/lib/draftHistory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const LEO = { id: UID, email: "leo@example.com" };
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-25T04:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

let seq = 0;
const d = (format: string, reactions: number, days: number, extra: Partial<DraftEntry> = {}): DraftEntry =>
  ({ id: `d${seq++}`, createdAt: ago(days + 1), hook: "Hook", draft: `Hook\nA post about CPF number ${seq}.`, pillar: "topic", pillarDetail: "", audience: "", format,
     platform: "linkedin", ctaType: "", status: "posted", postedAt: ago(days), metrics: { reactions }, ...extra }) as DraftEntry;
const many = (n: number, f: (i: number) => DraftEntry) => Array.from({ length: n }, (_, i) => f(i));
// the spec's seed: 8 carousels at twice the median, 11 text posts at it, and 2 short videos
const seeded = () => [...many(8, (i) => d("carousel", 200, 3 + i * 3)), ...many(11, (i) => d("text-post", 100, 4 + i * 3)), ...many(2, (i) => d("short-video", 100, 5 + i))];

const html = (drafts: DraftEntry[], query = "") =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/analytics${query}`] }, createElement(WhatWins, { userId: UID, drafts })));
const href = (url: string) => `href="${url.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")}"`;
const unescape = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const ctxOf = (url: string) => new URLSearchParams(url.split("?")[1]).get("ctx");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  as.user = LEO;
  callFn.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  as.store.clear();
  as.job = null;
});

describe("What wins for everyone else", () => {
  it("draws nothing for another sign-in, or while the sign-in is still being read", () => {
    as.user = null;
    expect(html(seeded())).toBe("");
    as.user = undefined;
    expect(html(seeded())).toBe("");
    expect(callFn).not.toHaveBeenCalled();
  });
});

describe("What wins for Leo", () => {
  it("asks for numbers on 5 posted posts first, linking to Add your numbers on this page", () => {
    // one post older than 90 days: the list holds the whole window
    const out = html([...many(4, (i) => d("text-post", 100, 3 + i)), d("text-post", 100, 120)], "?period=90d");
    expect(out).toContain('id="what-wins"');
    expect(out).toContain("Last 90 days, 4 posts with numbers");
    expect(out).toContain("Add numbers to 5 posted posts to see what wins.");
    expect(out).toContain(`${href("/analytics?period=90d#add-your-numbers")}`);
    expect(out).not.toContain("aria-pressed");
  });

  it("scores formats against your usual: carousels 2x, text posts 1x, and 2 short videos too few to say, with no button", () => {
    const drafts = seeded();
    const out = html(drafts);
    expect(out).toContain(subLine(drafts, NOW));
    expect(subLine(drafts, NOW)).toMatch(/^Since 21 Sept?, 21 posts with numbers$/);
    const text = out.replace(/<[^>]+>/g, "|");
    expect(text).toMatch(/Carousels\|+8 posts\|+2x your usual\|+Make another/);
    expect(text).toMatch(/Text posts\|+11 posts\|+1x your usual\|+Make another/);
    expect(text).toMatch(/Short video\|+2 posts\|+Too few to say\|/);
    expect(text.indexOf("Carousels")).toBeLessThan(text.indexOf("Text posts"));
    expect(out.match(/Make another/g)).toHaveLength(2);
    expect(out).toContain(href(makeAnotherUrl("format", { key: "carousel", label: "Carousels", posts: 8, score: 2, platform: "linkedin" })));
    expect(out).toContain('aria-pressed="true"');
    expect(callFn).not.toHaveBeenCalled();
  });

  it("opens Write with the formula and the no-copy line from a hook row", () => {
    const drafts = [...many(4, (i) => d("text-post", 300, 3 + i, { hookFormula: "myth-bust" })), ...many(6, (i) => d("text-post", 100, 4 + i))];
    const out = html(drafts, "?wins=hook");
    expect(out).toMatch(/Myth bust<\/p>.*4 posts.*3x your usual/);
    const url = makeAnotherUrl("hook", { key: "myth-bust", label: "Myth bust", posts: 4, score: 3, platform: "linkedin" });
    expect(url).toContain("formula=myth-bust");
    expect(ctxOf(url)).toContain("Do not reuse my earlier wording.");
    expect(out).toContain(href(url));
  });

  it("counts a Jev-tagged hook and angle, saved for the brand", () => {
    const drafts = many(6, (i) => d("text-post", 100, 3 + i));
    saveDrafts(UID, drafts);
    saveTags(UID, { tags: Object.fromEntries(drafts.map((x) => [x.id, { angle: "Educational", hook: "number-reveal", at: ago(1) }])) });
    expect(html(drafts, "?wins=angle")).toMatch(/Educational<\/p>.*6 posts.*1x your usual/);
    expect(html(drafts, "?wins=hook")).toMatch(/Number reveal<\/p>.*6 posts/);
  });

  it("shows the reading line on Hook and Angle while tags arrive, never on Format", () => {
    as.job = { running: true, done: 20, total: 26, error: null };
    const drafts = seeded();
    expect(html(drafts, "?wins=hook")).toContain("Reading your posts... 20 of 26");
    expect(html(drafts, "?wins=angle")).toContain("Reading your posts... 20 of 26");
    expect(html(drafts)).not.toContain("Reading your posts");
  });

  it("says angles wait on a Jev null, adds the cap's own line on a 429, and keeps Hook to formula posts", () => {
    const drafts = [...seeded(), ...many(3, (i) => d("text-post", 100, 6 + i, { hookFormula: "contrarian" }))];
    as.job = { running: false, done: 0, total: 20, error: { message: "Angles show once your posts are read. Try again later.", code: "unavailable" } };
    const angle = html(drafts, "?wins=angle");
    expect(angle).toContain("Angles show once your posts are read. Try again later.");
    expect(angle).not.toContain("None of your posts take a clear angle yet.");
    as.job = { running: false, done: 0, total: 20, error: { message: "You've used all 10 for today. It resets at 8am Singapore time.", code: "daily_limit" } };
    expect(unescape(html(drafts, "?wins=angle"))).toContain("You've used all 10 for today. It resets at 8am Singapore time.");
    const hook = html(drafts, "?wins=hook");
    expect(hook).toMatch(/Contrarian take<\/p>.*3 posts/);
    expect(hook).not.toContain("Angles show once");
  });

  it("lists formats with no post in 90 days on the network you post on most, each with Try it", () => {
    // a carousel 120 days ago, and short videos on TikTok, the network posted on less
    const drafts = [...many(6, (i) => d("text-post", 100, 3 + i)), d("carousel", 100, 120), ...many(5, (i) => d("short-video", 100, 3 + i, { platform: "tiktok" }))];
    const out = html(drafts);
    const tail = out.slice(out.indexOf("Not tried yet"));
    expect(out).toContain("Not tried yet");
    expect(tail).toMatch(/^Not tried yet<\/h3>.*Short video<\/p>.*Try it.*Carousels<\/p>.*Try it<\/a><\/li><\/ul>/);
    expect(tail.match(/Try it/g)).toHaveLength(2);
    expect(out).toContain(href(tryItUrl("format", "carousel", "linkedin")));
    expect(ctxOf(tryItUrl("format", "carousel", "linkedin"))).toMatch(/^I haven't tried Carousels yet\./);
  });

  it("hides Not tried yet when every format has a post", () => {
    expect(html(seeded())).not.toContain("Not tried yet");
  });
});
