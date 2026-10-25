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
    job: null as unknown,
    left: {} as Record<string, number>,
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
vi.mock("@/lib/resolveSource", () => ({
  resolveSource: (key: string) => (key === as.key ? as.source : key === "ad:9" ? { ...as.source, key, title: "Save $12,000 a year with us" } : null),
  // an upload's or a clone's words are read from the device's linked sources
  loadLinkedSources: () => [],
}));
vi.mock("@/lib/remixJob", async (actual) => ({ ...(await actual<typeof import("@/lib/remixJob")>()), remixJob: () => as.job }));
vi.mock("@/lib/aiUsage", async (actual) => ({ ...(await actual<typeof import("@/lib/aiUsage")>()), useUsesLeft: () => (f: string) => as.left[f] ?? null }));
// the sheet portals to document.body, which node has no part of
vi.mock("react-dom", async (load) => ({ ...(await load<object>()), createPortal: (node: unknown) => node }));
(globalThis as { document?: unknown }).document ??= { body: null };

import RemixSheet from "./RemixSheet";

const html = (page = "/swipe", extra = "") =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [`${page}?remix=${encodeURIComponent(as.key)}${extra}`] }, createElement(RemixSheet, { user: { id: "u1", email: "someone@example.com" } })),
  );

afterEach(() => {
  as.user = null;
  as.job = null;
  as.left = {};
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

  const VERSIONS_ROW = /<section class="space-y-2" aria-labelledby="remix-versions">.*?<\/section>/;
  const leo = () => (as.user = { id: "u1", email: "leo@example.com" });

  it("adds 'Ask the agent instead' under the main button and the Versions row under Make, and nothing else", () => {
    leo();
    const out = html();
    expect(out).toMatch(AGENT_LINK);
    expect(out.indexOf("Ask the agent instead")).toBeGreaterThan(out.indexOf("<footer"));
    expect(out.indexOf('id="remix-versions"')).toBeGreaterThan(out.indexOf('id="remix-make"'));
    const pinned = readFileSync(new URL("../__pins__/remix-sheet-everyone.html", import.meta.url), "utf8");
    expect(out.replace(AGENT_LINK, "").replace(VERSIONS_ROW, "")).toBe(pinned);
  });

  it("picks 1 version by default, and versions=3 reads Remix 3 versions; nobody else gets the row or the label", () => {
    leo();
    const one = html();
    expect(one.match(VERSIONS_ROW)?.[0]).toMatch(/aria-pressed="true"[^>]*>1<\/button>.*aria-pressed="false"[^>]*>3<\/button>/);
    expect(one).not.toContain("Remix 3 versions");
    const three = html("/swipe", "&versions=3");
    expect(three.match(VERSIONS_ROW)?.[0]).toMatch(/aria-pressed="false"[^>]*>1<\/button>.*aria-pressed="true"[^>]*>3<\/button>/);
    expect(three).toContain("Remix 3 versions");
    as.user = null;
    expect(html("/swipe", "&versions=3")).not.toContain("Remix 3 versions");
    expect(html("/swipe", "&versions=3")).not.toContain("remix-versions");
  });

  it("turns the 3 chip off with its reason when fewer than 3 remixes are left, and the button off when 3 is picked", () => {
    leo();
    as.left = { "remix-make": 2 };
    const out = html();
    expect(out.match(VERSIONS_ROW)?.[0]).toMatch(/<button[^>]*disabled=""[^>]*>3<\/button>/);
    expect(out).toContain("Needs 3 remixes left today.");
    expect(html("/swipe", "&versions=3")).toMatch(/<button[^>]*disabled=""[^>]*>.*Remix 3 versions/);
    as.left = { "remix-make": 3 };
    expect(html()).not.toContain("Needs 3 remixes left today.");
  });

  it("makes versions of one text format: a carousel and a script picked keep only the carousel", () => {
    leo();
    const out = html("/swipe", "&versions=3&as=carousel,script");
    const make = out.slice(out.indexOf('id="remix-make"'), out.indexOf('id="remix-versions"'));
    expect(make.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(make).toMatch(/aria-pressed="true"[^>]*>Carousel/);
    // a video alone can't have versions
    const video = html("/swipe", "&versions=3&as=speaking");
    expect(video).toContain("Versions are of a post, a carousel or a script.");
    expect(video).not.toContain("Remix 3 versions");
  });

  const versionsJob = (states: ("done" | "failed")[]) => ({
    id: 7,
    key: as.key,
    state: states.includes("done") ? "done" : "failed",
    step: "",
    set: { id: "vs-k2x9", kind: "versions", from: as.key },
    run: { keep: "structure", close: "balanced", mention: true, offer: null, versions: 3 },
    rows: states.map((st, i) =>
      st === "done"
        ? { as: "carousel", state: "done", step: "", draftId: `d${i}`, hook: `Hook number ${i}`, href: `/carousel?draft=d${i}`, formula: `f${i}` }
        : { as: "carousel", state: "failed", step: "", error: "This one didn't go through. Nothing was used for it.", refunded: true, formula: `f${i}` },
    ),
  });

  it("says 3 versions are ready with Open them on that set", () => {
    leo();
    as.job = versionsJob(["done", "done", "done"]);
    const out = html("/swipe", "&versions=3");
    expect(out).toContain("3 versions are ready");
    expect(out).toMatch(/<a [^>]*href="\/drafts\?set=vs-k2x9"[^>]*>Open them<\/a>/);
    expect(out.match(/Hook number \d/g)).toEqual(["Hook number 0", "Hook number 1", "Hook number 2"]);
    expect(out).not.toContain("Try the last one again");
  });

  it("keeps the two that came back and offers Try the last one again for the third", () => {
    leo();
    as.job = versionsJob(["done", "failed", "done"]);
    const out = html("/swipe", "&versions=3");
    expect(out).toContain("2 of 3 versions are ready");
    expect(out).toContain("Try the last one again");
    expect(out).toContain("This one didn&#x27;t go through. Nothing was used for it.");
    expect(out.match(/Hook number \d/g)).toEqual(["Hook number 0", "Hook number 2"]);
  });

  it("says which run is going when another one is busy", () => {
    leo();
    as.job = { ...versionsJob([]), key: "ad:9", state: "working", step: "Writing your carousel", rows: [] };
    expect(html()).toContain("Your 3 versions of &quot;Save $12,000 a year with us&quot; are still being made. This one can start once it&#x27;s done.");
    as.job = { ...(as.job as object), set: undefined };
    expect(html()).toContain("Your remix of &quot;Save $12,000 a year with us&quot; is still being made.");
    as.user = null;
    expect(html()).toContain("Your other remix is still going. This one can start once it&#x27;s done.");
  });
});

describe("Rebuild this edit on an upload's read (remix-format-clone, Leo only)", () => {
  const LINK = /<a [^>]*href="\/make\/same-edit\?source=upload%3Aab12cd"[^>]*>Rebuild this edit<\/a>/;
  const read = (format: string, kind = "upload") => {
    const was = { key: as.key, source: as.source };
    as.key = kind === "upload" ? "upload:ab12cd" : "clone:instagram:C1";
    as.source = { ...as.source, key: as.key, kind, format, title: "My reel", caption: "My reel" };
    return () => Object.assign(as, was);
  };

  it("links an uploaded video's read to the same edit page, and nothing else gets the link", () => {
    const back = read("video");
    try {
      as.user = { id: "u1", email: "leo@example.com" };
      expect(html()).toMatch(LINK);
      as.user = null;
      expect(html()).not.toContain("Rebuild this edit");
      as.user = undefined;
      expect(html()).not.toContain("Rebuild this edit");
    } finally {
      back();
    }
    for (const [format, kind] of [["image", "upload"], ["video", "clone"]] as const) {
      const undo = read(format, kind);
      try {
        as.user = { id: "u1", email: "leo@example.com" };
        expect(html()).not.toContain("Rebuild this edit");
      } finally {
        undo();
      }
    }
  });
});
