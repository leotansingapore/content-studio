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
const { getAllTopPosts } = await import("@/lib/topPosts");
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
  { name: "ReelCard", today: "Remix this", key: topKey, render: (at) => html(createElement(ReelCard, { item, onOpen: () => {} }), at) },
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
