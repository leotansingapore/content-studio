// /reels' line over the posts board for team posts (Leo 27 Oct: the board's "Review" read as where team posts are
// approved). It draws from the synced team posts, for Leo's sign-ins only, and only when one waits.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import ReelsPage from "./ReelsPage";

const UID = "40f07a18-b087-4c95-ba1f-d5444222968a";
const post = (id: string, day: string, over: Record<string, unknown> = {}) => ({
  id, title: id, product: "at", day, time: "10:00", image: "", message: "", rev: 1, revisedAt: null, postedAt: null, postLink: null,
  skipped: false, telegram: { approvedRev: null, comments: [] }, handled: [], ...over,
});
function device(posts: unknown[]) {
  const m = new Map<string, string>([[`content-studio-teamposts-${UID}`, JSON.stringify({ posts })]]);
  (globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined } };
}
const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/reels?profile=pmvaytr9ayhh1"] }, createElement(ReelsPage)));

afterEach(() => {
  as.user = null;
  delete (globalThis as { window?: unknown }).window;
});

describe("Posts board, team posts line", () => {
  it("tells Leo how many team posts wait, opens the first to go out, and links to all of them", () => {
    as.user = { id: UID, email: "tanjunsing@gmail.com" };
    device([post("tp9", "2026-10-31"), post("tp8", "2026-10-28"), post("tp7", "2026-10-20", { postedAt: "2026-10-20T02:00:00Z" })]);
    const out = html();
    expect(out).toContain("Team posts to review");
    expect(out).toMatch(/Team posts to review<span[^>]*>2<\/span>/);
    expect(out).toContain('href="/calendar?business=team-posts&amp;teampost=tp8"');
    expect(out).toContain('href="/calendar?business=team-posts&amp;profile=me"');
  });

  it("is hidden when no team post waits", () => {
    as.user = { id: UID, email: "tanjunsing@gmail.com" };
    device([post("tp7", "2026-10-20", { postedAt: "2026-10-20T02:00:00Z" }), post("tp6", "2026-10-21", { skipped: true })]);
    expect(html()).not.toContain("Team posts to review");
  });

  it("is hidden for every other sign-in, and while the sign-in is still being read", () => {
    device([post("tp8", "2026-10-28")]);
    expect(html()).not.toContain("Team posts to review");
    as.user = undefined;
    expect(html()).not.toContain("Team posts to review");
  });
});
