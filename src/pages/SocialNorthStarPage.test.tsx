// /social-north-star is Leo's only: everyone else gets the not-found page. Leo sees the plays the store holds, each
// card at its own anchor, the month's progress, and the example a link names marked.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Play } from "@/lib/socialNorthStar";

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
  return { user: null as null | undefined | { id: string; email: string }, store };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user, useLeoOnly: () => !!as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import SocialNorthStarPage from "./SocialNorthStarPage";

const html = (path = "/social-north-star") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(SocialNorthStarPage)));
const LEO = { id: "leo", email: "tanjunsing@gmail.com" };
const DAY = 86_400_000;
const recent = new Date(Date.now() - 2 * DAY).toISOString();
const example = (k: number, handle: string) => ({
  key: `tiktok:74${k}`, platform: "tiktok", handle, name: handle, ratio: 6.2, cover: `https://p16.tiktokcdn.com/${k}.jpeg`,
  post: { id: `74${k}`, url: `https://www.tiktok.com/@${handle}/video/74${k}`, format: "carousel", caption: "5 habits", postedAt: recent, views: 9000, likes: 90, comments: 3 },
});
const play = (id: string, target: number, recipe: Play["recipe"] = null) => ({
  id, accounts: 4, posts: 9, median: 4.2, perWeek: target / 4, target, hook: "numbered_tips", seconds: null, slides: 7, recipe,
  examples: [example(1, "app_one"), example(2, "app_two"), example(3, "creator_one")].map((e) => ({ ...e, key: `${e.key}${id.length}` })),
});
const seed = (o: Record<string, unknown> = {}) =>
  as.store.set("content-studio-social-ns-leo", JSON.stringify({
    builtAt: recent, triedAt: recent, basis: 12,
    labels: { "instagram:OWN1": { family: "faceless-slideshow", hook: null } },
    plays: [play("faceless-slideshow", 2, { hook: "5 [things] I stopped doing", body: "Cover, five slides, a close", caption: "One line", cta: "Save this" }), play("screen-demo", 3)],
    own: [{ platform: "instagram", handle: "brand", checkedAt: recent, posts: [{ id: "OWN1", url: "u", format: "carousel", caption: "", postedAt: recent, views: null, likes: 1, comments: 0 }] }],
    ...o,
  }));

beforeEach(() => as.store.clear());
afterEach(() => {
  as.user = null;
});

describe("the social north star gate", () => {
  it("shows a placeholder while the session loads", () => {
    as.user = undefined;
    expect(html()).toContain('aria-busy="true"');
  });

  it("answers anyone who is not Leo with the not-found page", () => {
    seed();
    const h = html();
    expect(h).not.toContain("Social north star");
    expect(h).not.toContain("Faceless slideshow");
  });
});

describe("the social north star", () => {
  it("draws each play at its own anchor, the month's progress against the brand's own posts, and the next one to make", () => {
    as.user = LEO;
    seed();
    as.store.set("content-studio-socialaccounts-leo", JSON.stringify({ instagram: { handle: "@brand", connectedAt: recent } }));
    // the brand's own accounts are read through window.localStorage
    vi.stubGlobal("window", { localStorage: globalThis.localStorage });
    const h = html();
    vi.unstubAllGlobals();
    expect(h).toContain(">Social north star</h1>");
    expect(h).toContain('id="faceless-slideshow"');
    expect(h).toContain('id="screen-demo"');
    // one of 2 slideshows made, none of 3 demos: 1 of 5 posts, and slideshows (the best play) are next
    expect(h).toContain("1 of 5 posts");
    expect(h).toMatch(/Next up: <a href="#faceless-slideshow"/);
    expect(h).toContain("4 accounts use it, 4.2x their usual");
    expect(h).toContain("5 [things] I stopped doing");
    expect(h).toContain("About 7 slides");
    expect(h).toContain("The rest of the recipe comes with the next build.");
    expect(h.match(/Make one like this/g)?.length).toBeGreaterThanOrEqual(2);
    expect(h).toContain('src="https://p16.tiktokcdn.com/1.jpeg"');
  });

  it("marks the example a link names", () => {
    as.user = LEO;
    seed();
    const h = html("/social-north-star?example=tiktok:74118");
    const at = h.indexOf("ring-primary/30");
    expect(h.slice(at, h.indexOf("</li>", at))).toContain("@app_one");
    expect(h.match(/ring-primary\/30/g)).toHaveLength(1);
  });

  it("plays each example in place, its cover behind the play button, with the handle, the multiple and a small link to the original under it", () => {
    as.user = LEO;
    seed();
    const h = html();
    const at = h.indexOf('aria-label="Best faceless slideshow posts"');
    const tile = h.slice(at, h.indexOf("</li>", at));
    expect(tile).toMatch(/<button type="button"[^>]*>.*src="https:\/\/p16.tiktokcdn.com\/1.jpeg".*Watch the slideshow<\/button>/);
    expect(tile.indexOf("Watch the slideshow")).toBeLessThan(tile.indexOf("@app_one"));
    expect(tile).toContain("6.2x usual");
    expect(tile).toMatch(/<a href="https:\/\/www.tiktok.com\/@app_one\/video\/741" target="_blank" rel="noopener noreferrer" aria-label="Open @app_one&#x27;s post on TikTok"/);
    // the tile itself no longer leaves the page
    expect(tile).not.toContain('aria-label="Open @app_one&#x27;s post, ');
  });

  it("says where to add the brand's own account when it has none, and counts nothing", () => {
    as.user = LEO;
    seed();
    const h = html();
    expect(h).toContain("Add your Instagram or TikTok under Your account audit in");
    expect(h).toContain('href="/analytics"');
    expect(h).not.toContain(" posts</span>");
  });

  it("says it is checking, never an empty plan, before the first start has run", () => {
    as.user = LEO;
    const h = html();
    expect(h).toContain("Checking your references...");
    expect(h).toContain('aria-live="polite"');
    expect(h).not.toContain("The plan builds from Apps like yours.");
  });
});
