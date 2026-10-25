// Analytics' Your real numbers card. Its first frame for any session that is not Leo's is pinned on today's code
// (learn-real-numbers is Leo's only). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  return { user: null as null | undefined | { id: string; email: string }, job: null as unknown };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user, useLeoOnly: () => !!as.user }));
// Leo's card reads the shared job; no test here runs it (effects don't run in a static render)
vi.mock("@/lib/realNumbers", async (actual) => {
  const real = await actual<typeof import("@/lib/realNumbers")>();
  return { ...real, numbersJob: (uid: string) => (as.job as ReturnType<typeof real.numbersJob>) ?? real.numbersJob(uid), refreshIfStale: () => undefined, refreshNumbers: async () => undefined };
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import RealNumbers, { jobChip, pickerDrafts } from "./RealNumbers";
import type { DraftEntry } from "@/lib/draftHistory";
import type { MetricsPost, NumbersJob } from "@/lib/realNumbers";

const html = (path = "/analytics") =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(RealNumbers, { userId: "u1", audited: [], onChange: () => undefined, onFollowers: () => undefined })),
  );

afterEach(() => {
  as.user = null;
  as.job = null;
  localStorage.clear();
  delete (globalThis as { window?: unknown }).window;
});

describe("Your real numbers for everyone else", () => {
  it("draws today's card", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/real-numbers-everyone.html");
  });
  it("draws today's card with a ?link= in the URL", async () => {
    await expect(html("/analytics?link=p1")).toMatchFileSnapshot("./__pins__/real-numbers-everyone.html");
  });
});

// MetricsPost is the shape social/metrics.ts gives the app (from https://zernio.com/openapi.json).
const n0 = { impressions: 0, reach: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
const post = (id: string, text: string, extra: Partial<MetricsPost> = {}): MetricsPost =>
  ({ id, zernioPostId: null, platform: "linkedin", accountId: "65000000000000000000a001", publishedAt: "2026-10-08T01:00:00Z", text, url: null, numbers: { ...n0, views: 1500, likes: 42 }, ...extra });
const job = (j: Partial<NumbersJob>): NumbersJob => ({ running: false, error: null, none: false, outside: [], followers: [], linked: [], at: null, ...j });
const draft = (id: string, text: string, extra: Partial<DraftEntry> = {}): DraftEntry =>
  ({ id, createdAt: "2026-10-01T00:00:00Z", hook: text.split(" ").slice(0, 3).join(" "), draft: text, pillar: "", pillarDetail: "", audience: "", format: "", platform: "linkedin", ctaType: "", status: "posted", postedAt: "2026-10-08T09:00:00+08:00", ...extra });
const LIVE = "Three CPF moves to make before 55 that most people miss";

function asLeo(drafts: DraftEntry[] = [], state?: object) {
  as.user = { id: "u1", email: "leo@example.com" };
  (globalThis as { window?: unknown }).window = { localStorage, dispatchEvent: () => true };
  localStorage.setItem("content-studio-drafts-u1", JSON.stringify(drafts));
  if (state) localStorage.setItem("content-studio-realnumbers-u1", JSON.stringify(state));
}

describe("Your real numbers on Leo's sign-in (learn-real-numbers)", () => {
  it("draws a quiet card, not today's, while the sign-in is still being read", () => {
    as.user = undefined;
    const out = html();
    expect(out).toContain("Your real numbers");
    expect(out).not.toContain("Use my real numbers");
  });

  it("says when it is updating", () => {
    asLeo();
    as.job = job({ running: true });
    const out = html();
    expect(out).toContain("Updating your numbers...");
    expect(out).not.toContain("Use my real numbers");
  });

  it("shows a failed pull with Try again and keeps the last list", () => {
    asLeo();
    as.job = job({ at: "2026-10-11T01:00:00Z", error: { message: "Couldn't read your numbers. Try again in a minute.", code: "", status: 0 }, outside: [post("p1", LIVE)] });
    const out = html();
    expect(out).toContain("Couldn&#x27;t update your numbers.");
    expect(out).toContain(">Try again</button>");
    expect(out).toContain("Posted outside the app (1)");
  });

  it("shows the server's 402 and 429 lines with no button, and keeps the last list", () => {
    asLeo();
    as.job = job({ at: "2026-10-11T01:00:00Z", error: { message: "Analytics isn't on this Zernio plan.", code: "no_analytics", status: 402 }, outside: [post("p1", LIVE)] });
    let out = html();
    expect(out).toContain("Analytics isn&#x27;t on this Zernio plan.");
    expect(out).not.toMatch(/>(Update|Try again)<\/button>/);
    expect(out).toContain("Posted outside the app (1)");
    as.job = job({ at: "2026-10-11T01:00:00Z", error: { message: "You've used today's 300 account reads. They reset at midnight.", code: "daily_limit", status: 429 }, outside: [post("p1", LIVE)] });
    out = html();
    expect(out).toContain("You&#x27;ve used today&#x27;s 300 account reads. They reset at midnight.");
    expect(out).not.toMatch(/>(Update|Try again)<\/button>/);
    expect(out).toContain("Posted outside the app (1)");
  });

  it("keeps the 402 line after a reload while the job is paused", () => {
    asLeo([], { on: true, at: "2026-10-11T01:00:00Z", notMine: [], pausedUntil: new Date(Date.now() + 3_600_000).toISOString() });
    expect(html()).toContain("Analytics isn&#x27;t on this Zernio plan.");
  });

  it("asks to connect an account when the brand has none", () => {
    asLeo();
    as.job = job({ at: "2026-10-11T01:00:00Z", none: true });
    const out = html();
    expect(out).toContain("No accounts are connected for this brand yet.");
    expect(out).toContain('href="/accounts"');
  });

  it("draws nothing when Social accounts is off for the sign-in", () => {
    asLeo();
    as.job = job({ error: { message: "Not enabled.", code: "", status: 404 } });
    expect(html()).toBe("");
  });

  it("gives each outside post Link to a post, and hides one already linked to a draft", () => {
    asLeo([draft("d1", "Other words", { live: { postId: "p2", platform: "linkedin", url: null, by: "you", numbers: { ...n0, likes: 3, at: "2026-10-11T01:00:00Z" } } })]);
    as.job = job({ at: new Date().toISOString(), outside: [post("p1", LIVE), post("p2", "Linked one")] });
    const out = html();
    expect(out).toContain("Posted outside the app (1)");
    expect(out.match(/>Link to a post<\/button>/g)).toHaveLength(1);
    expect(out).not.toContain("Linked one");
    expect(out).toContain("1 post shows real numbers.");
  });

  it("reads the numbers on a cold load of ?link= before the picker opens", () => {
    asLeo();
    expect(html("/analytics?link=p1")).toContain("Reading your numbers...");
    as.job = job({ running: true, at: "2026-10-11T01:00:00Z" });
    expect(html("/analytics?link=p1")).toContain("Reading your numbers...");
  });

  it("opens the picker for ?link= with the closest drafts first and None of these", () => {
    asLeo([
      draft("far", "Something else entirely about budgets"),
      draft("near", `${LIVE} and a long tail that goes on`),
      draft("ig", LIVE, { platform: "instagram" }),
    ]);
    as.job = job({ at: new Date().toISOString(), outside: [post("p1", LIVE)] });
    const out = html("/analytics?link=p1");
    expect(out).toContain("Which post is this?");
    expect(out).toContain(">None of these</button>");
    expect(out).toContain('aria-expanded="true"');
    expect(out).not.toContain("Reading your numbers...");
    expect(out.indexOf('aria-label="Link &quot;Three CPF moves&quot;"')).toBeGreaterThan(-1);
    expect(out.indexOf('aria-label="Link &quot;Three CPF moves&quot;"')).toBeLessThan(out.indexOf('aria-label="Link &quot;Something else entirely&quot;"'));
  });
});

describe("pickerDrafts", () => {
  const p = post("p1", LIVE);
  it("keeps posted drafts on the post's platform within 7 days that are not linked or sent through Zernio, closest first", () => {
    const list = [
      draft("a", "Something else"),
      draft("b", LIVE),
      draft("c", LIVE, { platform: "instagram" }),
      draft("d", LIVE, { postedAt: "2026-10-16T09:00:00+08:00" }),
      draft("e", LIVE, { postedAt: undefined, scheduledFor: "2026-10-14T09:00" }),
      draft("f", LIVE, { zernio: { key: "k", postId: "z1", status: "published" } as DraftEntry["zernio"] }),
      draft("g", LIVE, { live: { postId: "x", platform: "linkedin", url: null, by: "auto" } }),
      draft("h", LIVE, { status: "draft", postedAt: undefined }),
    ];
    expect(pickerDrafts(list, p).map((d) => d.id)).toEqual(["b", "e", "a"]);
  });
  it("lists at most 10", () => {
    expect(pickerDrafts(Array.from({ length: 12 }, (_, i) => draft(`d${i}`, LIVE)), p)).toHaveLength(10);
  });
  it("cuts a long draft to the live text's length before comparing", () => {
    const long = draft("long", `${LIVE} ${Array.from({ length: 200 }, (_, i) => `tail${i}`).join(" ")}`);
    const short = draft("short", "Three CPF moves people miss");
    expect(pickerDrafts([short, long], p).map((d) => d.id)).toEqual(["long", "short"]);
  });
});

describe("jobChip", () => {
  it("names the run, the plan, the cap and a failure, and nothing once a run lands", () => {
    expect(jobChip(job({ running: true }), false)?.text).toBe("Updating your numbers...");
    expect(jobChip(job({ error: { message: "Analytics isn't on this Zernio plan.", code: "no_analytics", status: 402 } }), false)).toEqual({ text: "Analytics isn't on this Zernio plan.", tone: "muted" });
    expect(jobChip(job({}), true)?.text).toBe("Analytics isn't on this Zernio plan.");
    expect(jobChip(job({ error: { message: "Daily limit.", code: "daily_limit", status: 429 } }), false)).toEqual({ text: "Daily limit.", tone: "muted" });
    expect(jobChip(job({ error: { message: "x", code: "failed", status: 502 } }), false)).toEqual({ text: "Couldn't update your numbers.", tone: "error", retry: true });
    expect(jobChip(job({ at: "2026-10-11T01:00:00Z" }), false)).toBeNull();
  });
});
