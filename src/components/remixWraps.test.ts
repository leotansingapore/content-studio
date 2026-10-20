// The browse cards wrapped in RemixButton (docs/north-star/items/remix-everywhere.md, the table under "What we have
// today"). Rendered to markup in node: everyone but Leo keeps today's link, Leo gets one Remix button carrying the
// card's own source key (it reads "Opening..." when ?remix= names that key) and the "Remixed {d MMM}" tag.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ leo: null as { id: string; email: string } | null, remixed: new Map<string, string>() }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => gate.leo, useLeoOnly: () => Boolean(gate.leo) }));
vi.mock("@/lib/remixSource", async (load) => ({ ...(await load<object>()), remixedKeys: () => gate.remixed }));
// the drawer portals to document.body, which node has no part of
vi.mock("react-dom", async (load) => ({ ...(await load<object>()), createPortal: (node: unknown) => node }));
(globalThis as { document?: unknown }).document ??= { body: null };

const { default: ReelCard } = await import("./ReelCard");
const { default: TopPostCard } = await import("./TopPostCard");
const { default: PostDetailDrawer } = await import("./PostDetailDrawer");
const { default: AdsSwipe } = await import("./AdsSwipe");
const { default: Inspiration } = await import("./Inspiration");
const { default: InspirationDetailPage } = await import("@/pages/InspirationDetailPage");
const { ADS } = await import("@/lib/adsSwipe");
const { getAllTopPosts, getTopPostsForAdvisor, topAdvisorId } = await import("@/lib/topPosts");
const { fromTopPost } = await import("@/lib/remixSource");
const { resolveSource } = await import("@/lib/resolveSource");
const { default: advisors } = await import("@/data/advisors.json");
const { default: inspiration } = await import("@/data/inspiration.json");

const LEO = { id: "u1", email: "leo@example.com" };
const post = getAllTopPosts()[0];
const advisor = { id: post.advisorId, name: post.advisorName, handle: post.handle };
const item = {
  post,
  insight: { topic: null, angle: null, audiences: [], tags: [], trigger: null, structure: "Hook, three points, CTA", ratio: 1, breakout: false },
};
const topKey = `top:${post.advisorId}-${post.shortCode}`;
const ad = ADS[0];
const insp = (inspiration as { id: string }[])[0];

const html = (el: ReactElement, at = "/") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, el));
const cases: { name: string; today: string; key: string; render: (at: string) => string }[] = [
  { name: "ReelCard", today: "Remix this", key: topKey, render: (at) => html(createElement(ReelCard, { item, href: "?post=x" }), at) },
  { name: "TopPostCard", today: "Remix this", key: topKey, render: (at) => html(createElement(TopPostCard, { post, advisor }), at) },
  {
    name: "PostDetailDrawer",
    today: "Remix this for my business",
    key: topKey,
    render: (at) => html(createElement(PostDetailDrawer, { item, all: [item], saved: false, onToggleSave: () => {}, onOpen: () => {}, onClose: () => {} }), at),
  },
  { name: "AdsSwipe", today: "Write a post like this", key: `ad:${ad.adId}`, render: (at) => html(createElement(AdsSwipe), at) },
  { name: "Inspiration", today: "Use as vibe", key: `insp:${insp.id}`, render: (at) => html(createElement(Inspiration), at) },
  {
    name: "InspirationDetailPage",
    today: "Use as vibe",
    key: `insp:${insp.id}`,
    render: (at) =>
      html(
        createElement(Routes, null, createElement(Route, { path: "/inspiration/:id", element: createElement(InspirationDetailPage) })),
        `/inspiration/${insp.id}${at.slice(1)}`,
      ),
  },
];

beforeEach(() => {
  gate.leo = null;
  gate.remixed = new Map();
});

describe.each(cases)("$name", ({ today, key, render }) => {
  it("keeps today's link for everyone but Leo", () => {
    const out = render("/");
    expect(out).toContain(today);
    expect(out).not.toContain(">Remix</button>");
  });

  it("gives Leo one Remix button with the card's own key in place of today's link", () => {
    gate.leo = LEO;
    const out = render("/");
    expect(out).not.toContain(today);
    expect(out).toContain("Remix</button>");
    expect(render(`/?remix=${encodeURIComponent(key)}`)).toContain("Opening...");
  });

  it("tags a card this brand has remixed", () => {
    gate.leo = LEO;
    expect(render("/")).not.toContain("Remixed ");
    gate.remixed = new Map([[key, "2026-10-12T03:00:00.000Z"]]);
    expect(render("/")).toContain("Remixed 12 Oct");
  });
});

it("an inspiration card inside Write keeps Use as vibe for Leo, since it picks a vibe for the open draft", () => {
  gate.leo = LEO;
  const out = html(createElement(Inspiration, { onUseAsVibe: () => {} }));
  expect(out).toContain("Use as vibe");
  expect(out).not.toContain("Remix</button>");
});

describe("top post keys", () => {
  type Entry = { id: string; name: string; handle: string };
  const withPosts = (advisors as Entry[]).filter((a) => getTopPostsForAdvisor(a as never).length);

  it("key every advisor's top posts on the Instagram profile, so the sheet resolves them from any entry", () => {
    expect(withPosts.some((a) => a.id.endsWith("-youtube"))).toBe(true);
    for (const a of withPosts) {
      for (const p of getTopPostsForAdvisor(a as never)) {
        const key = fromTopPost(p, { ...a, id: topAdvisorId(a.handle) ?? a.id }).key;
        expect(resolveSource(key, LEO.id), `${a.id} ${key}`).not.toBeNull();
      }
    }
  });

  it("TopPostCard on a YouTube entry's profile carries the Instagram key", () => {
    gate.leo = LEO;
    const yt = withPosts.find((a) => a.id === "honey-money-sg-youtube")!;
    const p = getTopPostsForAdvisor(yt as never)[0];
    const key = `top:${topAdvisorId(yt.handle)}-${p.shortCode}`;
    expect(key).not.toContain("youtube");
    const out = html(createElement(TopPostCard, { post: p, advisor: { id: yt.id, name: yt.name, handle: yt.handle } }), `/?remix=${encodeURIComponent(key)}`);
    expect(out).toContain("Opening...");
  });
});
