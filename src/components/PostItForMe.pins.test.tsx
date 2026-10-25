// Post it for me's first frame, pinned on today's code for any session that is not Leo's (and while the sign-in is
// still being read): the schedule steps (publish-schedule) are Leo's only. Never update the pinned file with vitest -u.
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
  return { user: null as null | undefined | { id: string; email: string } };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user, useLeoOnly: () => !!as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import { PostItForMePanel } from "./PostItForMe";
import type { DraftEntry } from "@/lib/draftHistory";

const draft: DraftEntry = {
  id: "d1",
  createdAt: "2026-10-01T00:00:00.000Z",
  hook: "3 CPF myths at 55",
  draft: "3 CPF myths at 55\n\nMyth one.",
  pillar: "topic",
  pillarDetail: "",
  audience: "general",
  format: "text-post",
  platform: "linkedin",
  ctaType: "comment-keyword",
  status: "scheduled",
  scheduledFor: "2030-01-15T09:00",
};

const html = () =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ["/drafts"] }, createElement(PostItForMePanel, { userId: "u1", draft, blockReason: null, onDrafts: () => undefined, onClose: () => undefined })),
  );

afterEach(() => {
  as.user = null;
});

describe("Post it for me for everyone else", () => {
  it("draws today's panel", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/post-it-for-me-everyone.html");
  });
  it("draws today's panel while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/post-it-for-me-everyone.html");
  });
});
