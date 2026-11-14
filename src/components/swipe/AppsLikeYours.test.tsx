// Apps like yours' tab under /swipe's h1, which already names it: no heading of its own, the count and the month's spend
// on its top row.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
  };
  return m;
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import AppsLikeYours from "./AppsLikeYours";

const html = (path = "/swipe?tab=similar") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppsLikeYours, { userId: "u1" })));
const account = (handle: string, name = handle) => ({ platform: "tiktok", handle, name, bio: "", followers: 9000, kind: "app_or_brand", score: 0.8, via: "@tiimoapp", addedAt: "2026-10-30T00:00:00Z" });
const DAY = 86_400_000;
const post = (id: string, daysAgo: number, o: Record<string, unknown> = {}) => ({
  // TikTok ids are digits: the player link is built from them
  id, url: `https://www.tiktok.com/@a/video/${id.replace(/\D/g, "")}0`, format: "video", caption: `Post ${id}`, postedAt: new Date(Date.now() - daysAgo * DAY).toISOString(), views: 1000, likes: 10, comments: 1, ...o,
});
// read today, so opening the tab reads nothing
const read = (handle: string, posts: ReturnType<typeof post>[]) => ({ platform: "tiktok", handle, addedAt: "x", history: [], posts, seen: [], fresh: [], checkedAt: new Date().toISOString() });
const withPosts = () =>
  store.set("content-studio-similar-u1", JSON.stringify({
    accounts: [account("app_one", "Finch"), account("app_two", "Tiimo"), account("unread", "Structured")],
    posts: {
      "tiktok:app_one": read("app_one", [post("a1", 2, { caption: "Morning routine that sticks" }), post("a2", 4, { views: 9000 }), post("a3", 6)]),
      "tiktok:app_two": read("app_two", [post("t1", 1, { caption: "Self care Sunday" })]),
    },
    dismissed: [], month: { spent: 1.2, cap: 40 }, foundAt: "2026-11-01T00:00:00Z",
  }));
const chip = (h: string, name: string) => h.match(new RegExp(`<button[^>]*aria-pressed="(true|false)"[^>]*>(?:(?!</button>).)*?${name}(?:(?!</button>).)*?</button>`))?.[0] ?? "";

beforeEach(() => store.clear());

describe("Apps like yours under the page's heading", () => {
  it("has no heading of its own, and starts on the find with nothing above it before anything is found", () => {
    const h = html();
    expect(h).not.toMatch(/<h2/);
    expect(h).toContain('aria-label="Apps like yours"');
    expect(h.indexOf("Find apps like yours")).toBeLessThan(h.indexOf("Add an account you like"));
    expect(h).not.toContain('aria-label="Search posts"');
    expect(h).not.toContain("this month");
    // the page's header line says what the tab is for, so the tab doesn't say it again
    expect(h).not.toContain("See how apps and creators like yours post");
    expect(h).not.toContain("Social north star");
  });

  it("links to the social north star, the formats that win among these accounts, and keeps the month's spend beside Find", () => {
    withPosts();
    const h = html();
    expect(h).toMatch(/The formats that win among these: <a [^>]*href="\/social-north-star"[^>]*>Social north star<\/a>/);
    const find = h.slice(h.indexOf("Find apps like yours"));
    expect(find).toContain("US$1.20 of US$40 this month");
  });
});

describe("Apps like yours in the ad library's layout", () => {
  it("lays out search with Filters and Sort, All and one chip per account with its count, the count line, the cards, then finding and adding", () => {
    withPosts();
    const h = html();
    const at = (s: string) => h.indexOf(s);
    expect(h).toContain('placeholder="Search captions and accounts"');
    expect(at('aria-label="Search posts"')).toBeLessThan(at("Filters"));
    expect(at("Filters")).toBeLessThan(at('aria-label="Sort"'));
    expect(at('aria-label="Sort"')).toBeLessThan(at('aria-label="Whose posts"'));
    expect(chip(h, "All")).toMatch(/aria-pressed="true"[^]*All[^]*>4<\/span>/);
    expect(chip(h, "Finch")).toMatch(/aria-pressed="false"[^]*>F<\/span>[^]*Finch[^]*>3<\/span>/);
    expect(chip(h, "Tiimo")).toMatch(/Tiimo[^]*>1<\/span>/);
    expect(chip(h, "Structured")).toMatch(/Structured[^]*>0<\/span>/); // on the list, nothing read yet
    expect(h).toContain(">4 posts from 2 accounts</span>");
    expect(at("4 posts from 2 accounts")).toBeLessThan(at("<article"));
    expect(h.match(/<article/g)).toHaveLength(4);
    expect(at("<article")).toBeLessThan(at("Find apps like yours"));
    expect(at("Find apps like yours")).toBeLessThan(at("Add an account you like"));
    // the format chips wait behind Filters; Not this one waits for an account's chip
    expect(h).not.toContain('aria-label="Format"');
    expect(h).not.toContain("Not this one");
  });

  it("draws each post as the ad library's card: the post with its tags and Remix, whose it is, two lines of caption, the meta line", () => {
    withPosts();
    const card = html().match(/<article[^]*?<\/article>/g)?.find((a) => a.includes("Self care Sunday")) ?? "";
    expect(card).toMatch(/Watch the video[^]*Remix[^]*Tiimo <span[^>]*>@app_two<\/span>[^]*line-clamp-2[^>]*>Self care Sunday<\/p>[^]*TikTok video \| /);
    expect(card).toContain("1.0k views, 10 likes, 1 comments");
    expect(card).toContain('aria-label="Copy link to Tiimo&#x27;s post"');
    // Save is Leo's (SaveButton draws nothing for anyone else), as Remix's sheet is
    expect(card).toMatch(/href="https:\/\/www.tiktok.com\/@a\/video\/10"[^>]*>[^]*Open/);
  });

  it("reads the account chip, the search, the sort and the format from the address", () => {
    withPosts();
    const one = html("/swipe?tab=similar&scope=tiktok%3Aapp_one");
    expect(chip(one, "Finch")).toContain('aria-pressed="true"');
    expect(chip(one, "All")).toContain('aria-pressed="false"');
    expect(one).toContain(">3 posts from 1 account</span>");
    expect(one).toMatch(/@app_one <span[^>]*>TikTok<\/span>[^]*Not this one/);
    // a chip for an account no longer on the list reads as All
    expect(chip(html("/swipe?tab=similar&scope=tiktok%3Agone"), "All")).toContain('aria-pressed="true"');
    const searched = html("/swipe?tab=similar&q=routine");
    expect(searched).toContain('value="routine"');
    expect(searched).toContain(">1 post from 1 account</span>");
    expect(html("/swipe?tab=similar&sort=views")).toMatch(/<option value="views" selected="">Most views<\/option>/);
    const ugc = html("/swipe?tab=similar&f=ugc");
    expect(ugc).toMatch(/aria-label="Format"[^]*aria-pressed="true"[^>]*>UGC<\/button>/);
    expect(ugc).toContain("No posts match these filters.");
  });

  it("says when a picked account has nothing read yet", () => {
    withPosts();
    expect(html("/swipe?tab=similar&scope=tiktok%3Aunread")).toContain("Nothing read from @unread yet.");
  });
});
