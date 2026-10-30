// /linkedin for any sign-in: the interview's steps, Write my strategy held until the first two answers are in, and the
// written strategy, whose angles open Write on LinkedIn at their funnel stage. Rendered to markup (no effects run).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ user: { id: "u2", email: "someone@example.com" } as { id: string; email: string } | null }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false, useSignedInUser: () => who.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: LinkedInStrategyPage, canWrite } = await import("./LinkedInStrategyPage");
const { emptyAnswers } = await import("@/lib/linkedinStrategy");

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls, matchMedia: () => ({ matches: false }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  who.user = { id: "u2", email: "someone@example.com" };
});

const html = (path = "/linkedin") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(LinkedInStrategyPage)));
const bucket = (name: string, angle: string) => ({ name, reader: "New managers", why: "Twelve years managing.", angles: [angle], proof: "", format: "text" });
const STRATEGY = {
  icp: "First-time managers at tech firms.",
  outcome: "Two discovery calls a week.",
  split: { top: 40, middle: 40, bottom: 20 },
  splitWhy: "The default fits.",
  top: [bucket("Manager stories", "The meeting I cancel in week one"), bucket("Hot takes", "Most training is too long")],
  middle: [bucket("First 90 days", "Your first one-to-one, step by step"), bucket("Hard talks", "How to say no to your old peers")],
  bottom: [bucket("How it works", "What six sessions look like"), bucket("Objections", "Should your company pay?")],
  principles: ["Short sentences."],
  cadence: "Three posts a week.",
  measures: ["Replies from managers"],
  avoid: ["Politics"],
  questions: [],
};

describe("/linkedin", () => {
  it("opens the interview on step 1 for anyone signed in, and the not-on-your-account card when signed out", () => {
    const page = html();
    expect(page).toContain("Step 1 of 4");
    expect(page).toContain("What do you sell, and what does a client get?");
    expect(page).toContain("Next");
    who.user = null;
    expect(html()).toContain("on your account yet");
  });

  it("holds Write my strategy until the first two answers are in, and says why", () => {
    const page = html("/linkedin?step=4");
    expect(page).toContain("Write my strategy");
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>.*Write my strategy/s);
    expect(page).toContain("Answer the first two questions first.");
    expect(canWrite({ ...emptyAnswers(), offer: "Coaching for new managers", buyer: "First-time managers at tech firms" })).toBe(true);
    expect(canWrite({ ...emptyAnswers(), offer: "Coaching", buyer: "First-time managers at tech firms" })).toBe(false);
  });

  it("shows a written strategy, its split and every angle as a link into Write at its funnel stage", () => {
    store.set("content-studio-linkedin-strategy-u2", JSON.stringify({ answers: emptyAnswers(), strategy: STRATEGY, writtenAt: "2026-10-30T05:00:00.000Z" }));
    const page = html();
    expect(page).toContain("Top 40%, Middle 40%, Bottom 20%");
    expect(page).toContain("Write your first post");
    const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const writes = hrefs.filter((h) => h.startsWith("/generate"));
    expect(writes).toHaveLength(7);
    expect(writes[0]).toContain("funnel=attraction");
    expect(writes.some((h) => h.includes("funnel=trust") && /detail=Your(\+|%20)first/.test(h))).toBe(true);
    expect(writes.filter((h) => h.includes("funnel=conversion"))).toHaveLength(2);
    expect(writes.every((h) => h.includes("platform=linkedin") && h.includes("format=text-post"))).toBe(true);
    // ?step=1 reopens the answers over a written strategy
    expect(html("/linkedin?step=1")).toContain("See your strategy");
  });
});
