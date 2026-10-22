// The Remix sheet's first frame, pinned on today's code for any session that is not Leo's: it must draw exactly as
// it did before the agent link. Never update the pinned file with vitest -u.
import { readFileSync } from "node:fs";
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
  return {
    user: null as null | undefined | { id: string; email: string },
    key: "top:a1-ABC",
    source: {
      key: "top:a1-ABC",
      kind: "top-post",
      format: "carousel",
      platform: "instagram",
      author: "@sgmoney",
      title: "Three CPF moves before 55",
      caption: "Most people wait too long. Here are three moves to make before 55.",
      numbers: { likes: 4200 },
      remixedAt: "",
    },
  };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/resolveSource", () => ({ resolveSource: (key: string) => (key === as.key ? as.source : null) }));
// the sheet portals to document.body, which node has no part of
vi.mock("react-dom", async (load) => ({ ...(await load<object>()), createPortal: (node: unknown) => node }));
(globalThis as { document?: unknown }).document ??= { body: null };

import RemixSheet from "./RemixSheet";

const html = (page = "/swipe") =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [`${page}?remix=${encodeURIComponent(as.key)}`] }, createElement(RemixSheet, { user: { id: "u1", email: "someone@example.com" } })),
  );

afterEach(() => {
  as.user = null;
});

describe("the Remix sheet for everyone else", () => {
  it("draws today's sheet", async () => {
    await expect(html()).toMatchFileSnapshot("../__pins__/remix-sheet-everyone.html");
  });
  it("draws today's sheet while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("../__pins__/remix-sheet-everyone.html");
  });
});

describe("the Remix sheet on /agent", () => {
  it("never opens there, since /agent takes ?remix= into its composer", () => {
    expect(html("/agent")).toBe("");
    expect(html("/agent/tk2x")).toBe("");
    expect(html("/agents")).toContain('aria-labelledby="remix-title"');
  });
});

describe("the Remix sheet for Leo", () => {
  const AGENT_LINK = /<a [^>]*href="\/agent\?remix=top%3Aa1-ABC"[^>]*>Ask the agent instead<\/a>/;

  it("adds 'Ask the agent instead' under the main button, handing the agent this post, and nothing else", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    const out = html();
    expect(out).toMatch(AGENT_LINK);
    expect(out.indexOf("Ask the agent instead")).toBeGreaterThan(out.indexOf("<footer"));
    const pinned = readFileSync(new URL("../__pins__/remix-sheet-everyone.html", import.meta.url), "utf8");
    expect(out.replace(AGENT_LINK, "")).toBe(pinned);
  });
});
