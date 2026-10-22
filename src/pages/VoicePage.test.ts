// /voice is live for everyone: its first frame must draw exactly as it did before Leo's sections (pinned on
// today's code). Never update the pinned file with vitest -u.
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
  return { user: null as null | undefined | { id: string; email: string }, store };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), PLAYBOOK_TABS: [] }));

import VoicePage, { LearnedSection } from "./VoicePage";

const html = (path = "/voice") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(VoicePage)));

afterEach(() => {
  as.user = null;
  as.store.clear();
});

describe("/voice for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/voice-page-everyone.html");
  });
  it("draws today's page while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/voice-page-everyone.html");
  });
  it("draws today's page at #learned, which has no learned list for them", async () => {
    await expect(html("/voice#learned")).toMatchFileSnapshot("./__pins__/voice-page-everyone.html");
  });
});

describe("/voice for Leo", () => {
  it("waits for the account before drawing anything that can be typed in", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    const out = html();
    expect(out).toContain('aria-label="Loading"');
    expect(out).not.toContain("<textarea");
    expect(out).not.toContain("Your past posts");
  });
});

describe("/voice#learned for Leo: where each learning came from", () => {
  const at = "2026-10-19T03:00:00.000Z";
  const learned = (rows: object[]) => {
    as.store.set("content-studio-learnings-u1", JSON.stringify(rows));
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/voice#learned"] }, createElement(LearnedSection, { userId: "u1" })));
  };

  it("links a learning saved in a chat back to its message", () => {
    const out = learned([{ id: "l1", text: "Use an older man as my presenter", scope: "videos", source: "assistant", createdAt: at, thread: "tk2x", msg: "mk2y" }]);
    expect(out).toMatch(/<a [^>]*href="\/agent\/tk2x\?m=mk2y"[^>]*>From a chat, 19 Oct<\/a>/);
    expect(out).not.toContain("You told the assistant");
  });

  it("links to the chat alone when the message is not known, and a nudge's learning reads as a chat too", () => {
    const out = learned([
      { id: "l1", text: "Carousels, not posts", scope: "posts", source: "correction", createdAt: at, thread: "tk2x" },
      { id: "l2", text: "Use an AI presenter", scope: "videos", source: "correction", createdAt: at },
    ]);
    expect(out).toMatch(/<a [^>]*href="\/agent\/tk2x"[^>]*>From a chat, 19 Oct<\/a>/);
    expect(out.match(/From a chat, 19 Oct/g)).toHaveLength(2);
    expect(out.match(/<a /g)).toHaveLength(1);
  });

  it("keeps a stored thread id inside /agent", () => {
    const out = learned([{ id: "l1", text: "No emoji", scope: "posts", source: "assistant", createdAt: at, thread: "//evil.example", msg: "m1" }]);
    expect(out).toContain('href="/agent/%2F%2Fevil.example?m=m1"');
  });

  it("keeps today's labels, unlinked, for learnings with no chat", () => {
    const out = learned([
      { id: "l1", text: "Never open with a question", scope: "posts", source: "assistant", createdAt: at },
      { id: "l2", text: "Short lines", scope: "all", source: "typed", createdAt: at },
    ]);
    expect(out).toContain("You told the assistant, 19 Oct");
    expect(out).toContain("Typed here, 19 Oct");
    expect(out).not.toContain("<a ");
  });
});
