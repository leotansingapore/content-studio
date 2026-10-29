// Screens written for Singapore financial advisers (the diagnosis quiz, F.A.D.S., Top posts, the Singapore ads and
// Trends) are an adviser brand's only, as Inspiration and Creators are: any other brand's pages leave out every way
// in, while a deep link still opens them. Adviser brands and brands with nothing set keep today's screens.
//
// Coach and Home read the diagnosis in an effect, which a server render never runs: a small shim stands in for
// useState and useEffect inside the page's own body (as PlanPage.test.ts), runs the effects, and draws again.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
const shim = vi.hoisted(() => ({ on: false, i: 0, slots: [] as unknown[], effects: [] as (() => unknown)[] }));

vi.mock("react", async (actual) => {
  const real = await actual<typeof import("react")>();
  const useState = (init: unknown) => {
    if (!shim.on) return real.useState(init);
    const i = shim.i++;
    if (!(i in shim.slots)) shim.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [shim.slots[i], (v: unknown) => (shim.slots[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(shim.slots[i]) : v)];
  };
  const useEffect = (fn: () => unknown, deps?: unknown[]) => (shim.on ? void shim.effects.push(fn) : real.useEffect(fn as () => void, deps));
  return { ...real, default: { ...real, useState, useEffect }, useState, useEffect };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({
  ...(await actual<typeof import("@/lib/useLeoOnly")>()),
  useLeoUser: () => as.user,
  useLeoOnly: () => Boolean(as.user),
}));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) },
    functions: { invoke: () => Promise.reject(new Error("offline")) },
  },
}));
// Home asks the posts board who you are after the diagnosis is read: never the network here
vi.mock("@/lib/reelsBoard", async (actual) => ({ ...(await actual<typeof import("@/lib/reelsBoard")>()), checkMe: () => Promise.reject(new Error("offline")) }));

import { brandDevice } from "@/test/brandDevice";
import { QUESTIONS } from "@/lib/diagnosis";
import CoachPage from "./CoachPage";
import HomePage from "./HomePage";
import PlanPage from "./PlanPage";
import StudioPage from "./StudioPage";
import CreateGuidePage from "./CreateGuidePage";
import CloneReelPage from "./CloneReelPage";
import SwipeFilePage from "./SwipeFilePage";
import StockSearch from "@/components/StockSearch";
import WhoYouWatch from "@/components/competitors/WhoYouWatch";
import { ADS } from "@/lib/adsSwipe";

const ADVISER = "Financial adviser";
const COACH = "Coach";

function device(profession: string | undefined, rows: Record<string, unknown> = {}) {
  const local = brandDevice("u1", profession);
  for (const [k, v] of Object.entries(rows)) local.setItem(k, JSON.stringify(v));
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  vi.stubGlobal("document", { title: "", fonts: undefined });
}

afterEach(() => {
  as.user = null;
  vi.unstubAllGlobals();
});

const draw = (el: ReactElement, path = "/") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, el));

/** The frame after the page's own effects have read the stores. */
async function loaded(Page: () => ReactElement, path: string) {
  function Shimmed() {
    const was = { on: shim.on, i: shim.i, effects: shim.effects.length };
    shim.on = true;
    shim.i = 0;
    try {
      return Page();
    } catch (e) {
      shim.effects.length = was.effects;
      throw e;
    } finally {
      shim.on = was.on;
      shim.i = was.i;
    }
  }
  shim.slots = [];
  shim.effects = [];
  let out = draw(createElement(Shimmed), path);
  for (let round = 0; round < 2; round++) {
    for (const fn of shim.effects.splice(0)) fn();
    await new Promise((r) => setTimeout(r, 0));
    shim.effects = [];
    out = draw(createElement(Shimmed), path);
  }
  return out;
}

// every question answered with its last (weakest) option, so the diagnosis has a weakest area and a mission
const DIAGNOSED = {
  "content-studio-diagnosis-u1": {
    answers: Object.fromEntries(QUESTIONS.filter((q) => q.area).map((q) => [q.id, q.options.length - 1])),
    completedAt: "2026-10-01T00:00:00.000Z",
    role: "Financial advisor / consultant",
  },
};
const A_DRAFT = { "content-studio-drafts-u1": [{ id: "d1", draft: "A post", platform: "tiktok", createdAt: "2026-10-20T01:00:00Z", status: "draft" }] };
const QUIZ = "First, a quick diagnosis";

describe("the diagnosis quiz", () => {
  it("opens an adviser brand's Coach until it is taken, then shows its diagnosis", async () => {
    for (const p of [undefined, ADVISER]) {
      device(p);
      const first = await loaded(CoachPage, "/coach");
      expect(first).toContain(QUIZ);
      expect(first).not.toContain(">About you<");
      device(p, DIAGNOSED);
      const after = await loaded(CoachPage, "/coach");
      expect(after).toContain("Coach diagnosis");
      expect(after).toContain(">About you<");
    }
  });

  it("is never asked on another brand's Coach, nor its saved diagnosis shown, but ?view=quiz still opens it", async () => {
    device(COACH);
    const out = await loaded(CoachPage, "/coach");
    expect(out).not.toContain(QUIZ);
    expect(out).toContain(">About you<");
    expect(out).toContain("Review your posts");
    device(COACH, DIAGNOSED);
    expect(await loaded(CoachPage, "/coach")).not.toContain("Coach diagnosis");
    device(COACH);
    expect(await loaded(CoachPage, "/coach?view=quiz")).toContain(QUIZ);
  });

  it("drives an adviser brand's next move on Home, and nothing on another brand's", async () => {
    device(ADVISER, A_DRAFT);
    expect(await loaded(HomePage, "/home")).toContain("Start diagnosis");
    device(ADVISER, { ...A_DRAFT, ...DIAGNOSED });
    expect(await loaded(HomePage, "/home")).toContain("Your next move");

    device(COACH, A_DRAFT);
    const fresh = await loaded(HomePage, "/home");
    expect(fresh).toContain("Write a post");
    expect(fresh).not.toContain("Start diagnosis");
    expect(fresh).not.toContain("Content Score");
    device(COACH, { ...A_DRAFT, ...DIAGNOSED });
    const taken = await loaded(HomePage, "/home");
    expect(taken).not.toContain("Your next move");
    expect(taken).not.toContain("Start mission");
  });
});

describe("F.A.D.S.", () => {
  const POSITIONED = { "content-studio-positioning-u1": { oneLiner: "I help new parents sleep better.", topics: ["Naps"], audienceDetail: "", edge: "" } };
  const competitors = { list: [], dismissed: [] } as unknown as Parameters<typeof WhoYouWatch>[0]["state"];
  const watch = () => draw(createElement(WhoYouWatch, { userId: "u1", state: competitors, edit: null, openEdit: () => {}, closeEdit: () => {} }), "/competitors");

  it("is where an adviser brand's plan and competitor search send it", async () => {
    device(ADVISER);
    const plan = draw(createElement(PlanPage), "/plan");
    expect(plan).toContain('href="/fads"');
    expect(plan).toContain("Paste your F.A.D.S. output");
    device(ADVISER, POSITIONED);
    expect(await loaded(PlanPage, "/plan")).toMatch(/Positioning set\.<\/span> Tweak the fields below, or refine it in the <a[^>]*href="\/fads"/);
    device(ADVISER);
    as.user = { id: "u1", email: "tanjunsing@gmail.com" };
    expect(watch()).toMatch(/serve in <a[^>]*href="\/fads"[^>]*>F\.A\.D\.S\.<\/a> first/);
  });

  it("is named nowhere on another brand's plan, and its competitor search sends it to the plan's setup", async () => {
    device(COACH);
    const plan = draw(createElement(PlanPage), "/plan");
    expect(plan).toContain("Build my content plan");
    expect(plan).not.toContain("/fads");
    expect(plan).not.toContain("F.A.D.S.");
    device(COACH, POSITIONED);
    const set = await loaded(PlanPage, "/plan");
    expect(set).toContain("Positioning set.</span> Tweak the fields below.</p>");
    expect(set).not.toContain("F.A.D.S.");
    device(COACH);
    as.user = { id: "u1", email: "tanjunsing@gmail.com" };
    const out = watch();
    expect(out).not.toContain("/fads");
    expect(out).toMatch(/serve in <a[^>]*href="\/plan\?view=setup"[^>]*>Plan<\/a> first/);
  });
});

describe("Top posts, the Singapore ads and Trends", () => {
  const steps = (html: string) => [...html.matchAll(/bg-gradient-primary text-\[12px\] font-bold text-primary-foreground">(\d+)<\/span>/g)].map((m) => Number(m[1]));

  it("keep every way in on an adviser brand's pages", () => {
    device(ADVISER);
    expect(ADS.length).toBeGreaterThan(0);
    const studio = draw(createElement(StudioPage), "/studio");
    expect(studio).toContain('id="ads"');
    expect(studio).toContain('href="/swipe?tab=ads"');
    expect(studio).toContain('id="trending"');
    expect(studio).toContain(">All top posts");
    const guide = draw(createElement(CreateGuidePage), "/create-guide");
    expect(guide).toContain("Find an idea that already works");
    expect(guide.match(/href="\/swipe"/g)).toHaveLength(2);
    expect(steps(guide)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const clone = draw(createElement(CloneReelPage), "/clone");
    expect(clone).toContain('href="/trends"');
    expect(clone).toContain('href="/swipe"');
    const swipe = draw(createElement(SwipeFilePage), "/swipe");
    expect(swipe).toContain("Top posts to swipe");
    expect(swipe).toContain("SG finance creators");
    expect(swipe).toMatch(/aria-selected="true"[^>]*>Posts /);
    expect(swipe).toContain(">Industry news ");
    expect(swipe).toContain(">Ads ");
  });

  it("leave another brand's pages, and its Top posts page opens on News: feeds and mentions", () => {
    device(COACH);
    const studio = draw(createElement(StudioPage), "/studio");
    expect(studio).toContain('id="formats"');
    expect(studio).toContain('id="latest"');
    for (const gone of ["/swipe", 'id="ads"', 'id="trending"', "Ads running now", "Trending"]) expect(studio, gone).not.toContain(gone);
    const guide = draw(createElement(CreateGuidePage), "/create-guide");
    expect(guide).not.toContain("/swipe");
    expect(guide).not.toContain("Find an idea that already works");
    expect(steps(guide)).toEqual([1, 2, 3, 4, 5, 6]);
    const clone = draw(createElement(CloneReelPage), "/clone");
    expect(clone).toContain("What to paste:");
    expect(clone).not.toContain("/trends");
    expect(clone).not.toContain("/swipe");
    const swipe = draw(createElement(SwipeFilePage), "/swipe");
    expect(swipe).toMatch(/<h1[^>]*>.*News<\/h1>/);
    expect(swipe).not.toContain("SG finance creators");
    expect(swipe).not.toContain('role="tablist"');
    expect(swipe).toContain("Your feeds");
    expect(swipe).not.toContain("Industry news to talk about");
    expect(swipe).not.toContain("Formats working now");
  });

  it("still open from a deep link on another brand", () => {
    device(COACH);
    expect(draw(createElement(SwipeFilePage), "/swipe?tab=ads")).toContain("Paid ads running in Singapore");
  });
});

describe("the stock photo search", () => {
  const box = () => draw(createElement(StockSearch, { kind: "photo", onPick: async () => {}, onClose: () => {} }));

  it("hints a Singapore skyline to an adviser brand, a city skyline to any other", () => {
    device(ADVISER);
    expect(box()).toContain('placeholder="Family dinner, office, Singapore skyline"');
    device(COACH);
    expect(box()).toContain('placeholder="Family dinner, office, city skyline"');
  });
});

describe("Create guide", () => {
  const guide = () => draw(createElement(CreateGuidePage), "/create-guide");
  const OUTSIDE = ["CapCut", "Descript", "igram", "Later / Buffer", "Canva", "ChatGPT", "Higgsfield"];

  it("points every step at Postmosis's own tools, for any brand", () => {
    for (const who of [ADVISER, COACH]) {
      device(who);
      const out = guide();
      expect(out, who).toContain('href="/carousel"');
      expect(out, who).toContain('href="/edit"');
      expect(out, who).toContain('href="/edit?panel=ai"');
      expect(out, who).toContain('href="/clone"');
      for (const tool of OUTSIDE) expect(out, `${who}: ${tool}`).not.toContain(tool);
    }
  });

  it("keeps an adviser's lines and leaves them off another brand's guide", () => {
    device(ADVISER);
    const adviser = guide();
    for (const line of ["advisors like you", "advisory disclaimer", "MAS guidelines", "Compliance check before you post"]) expect(adviser).toContain(line);
    device(COACH);
    const coach = guide();
    expect(coach).toContain("Check it before you post");
    for (const word of ["advisor", "MAS", "disclaimer", "Compliance", "licensed"]) expect(coach, word).not.toContain(word);
  });

  it("offers Post it for me once posting is on, and a free scheduler until then", () => {
    device(COACH);
    expect(guide()).toContain("Meta Business Suite");
    expect(guide()).not.toContain("Post it for me");
    device(COACH, { "cs-social-connect": { on: true, at: Date.now() } });
    expect(guide()).toContain("Post it for me");
    expect(guide()).toContain('href="/calendar"');
    expect(guide()).not.toContain("Meta Business Suite");
  });
});
