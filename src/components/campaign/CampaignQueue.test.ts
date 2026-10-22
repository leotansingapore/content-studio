// The review queue's first frame for one post, drawn in node: what Make allows and what the side column shows. The
// campaign is the live-p5w4 one (calls/A2-campaign-store.json, posts 3 and 4); today's limits and "Who appears" are faked.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));
const fake = vi.hoisted(() => ({ left: {} as Record<string, number | null>, who: null as null | "mine" | "presenter" }));
vi.mock("@/lib/aiUsage", async (actual) => ({ ...(await actual<typeof import("@/lib/aiUsage")>()), useUsesLeft: () => (f: string) => fake.left[f] ?? null }));
vi.mock("@/lib/campaignActions", async (actual) => ({ ...(await actual<typeof import("@/lib/campaignActions")>()), savedWho: () => fake.who }));

import type { Campaign } from "@/lib/campaigns";
import CampaignQueue from "./CampaignQueue";

const CAMPAIGN: Campaign = {
  id: "c-mvjda76zrjdr",
  name: "Sales-oriented self-employed professionals and coaches | October",
  createdAt: "2026-10-22T09:56:02.964Z",
  audience: "au-mvjd74ulxc77",
  audienceName: "Sales-oriented self-employed professionals and coaches",
  angles: [
    { id: "an-mvjd9bjcxp6k", title: "One-tap activity", line: "Log sales activity in one tap while you move between client work." },
    { id: "an-mvjd9bjcu4z1", title: "Client context", line: "Keep client details and sales conversations together in one app." },
  ],
  platforms: ["linkedin"],
  formats: ["short-video", "ai-video"],
  weeks: 1,
  perWeek: 7,
  startDay: "2026-10-26",
  pictures: "stock",
  target: { posts: 7, winners: 1 },
  posts: [
    {
      n: 1, day: "2026-10-26", time: "08:30", angleId: "an-mvjd9bjcxp6k", format: "text-post", stage: "attraction", pillar: "identity", formulaId: "contrarian", ctaType: "open-question", state: "ready",
      hook: "Most people say more apps mean more control. We disagree.",
      body: "We bring CRM, a shared WhatsApp inbox, tasks and goals together in one phone app. Sales activity can also be logged in one tap.",
      cta: "What part of your sales workflow involves the most app switching?",
      mas: null,
    },
    {
      n: 3, day: "2026-10-28", time: "08:30", angleId: "an-mvjd9bjcxp6k", format: "short-video", stage: "attraction", pillar: "topic", formulaId: "mistake", ctaType: "open-question", state: "ready",
      hook: "The cost of skipping one tap is missing activity context.",
      script: "HOOK: The cost of skipping one tap is missing activity context.\nBODY: When you move between client work, it can be easy to leave sales activity unlogged. Then the record may not show the work you just did. Logging activity in one tap keeps it part of the workflow. You can move on without setting aside a separate block just to update your activity.\nCTA: What helps you remember to log sales activity?",
      cta: "What helps you remember to log sales activity?",
      mas: null,
    },
    {
      n: 4, day: "2026-10-29", time: "08:30", angleId: "an-mvjd9bjcu4z1", format: "ai-video", stage: "trust", pillar: "topic", formulaId: "before-after", ctaType: "save-share", state: "ready",
      hook: "Before, client details and sales conversations can be scattered across different places.",
      script: "Before, client details and sales conversations can be scattered across different places.\nNow, they can sit together in one app.\nOne change is bringing client management and conversations into the same workflow.\nSave this for your workflow, or share it with someone managing client conversations.",
      cta: "Save this for your workflow, or share it with someone managing client conversations.",
      mas: null,
    },
  ],
};
const NO_VIDEOS = "No AI videos left today. Back at 8am Singapore time.";

const html = (post: number) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/campaigns/${CAMPAIGN.id}?post=${post}`] }, createElement(CampaignQueue, { userId: "u-1", campaign: CAMPAIGN, angle: null })));
/** The Make button's opening tag. */
const makeButton = (out: string) => out.match(/<button[^>]*aria-keyshortcuts="1"[^>]*>/)![0];

afterEach(() => {
  fake.left = {};
  fake.who = null;
});

describe("Make on an AI video post when today's AI videos are used (live-p5w4 N1)", () => {
  it("stays on with Ask each time, which only hands the script to the editor and spends nothing", () => {
    fake.left = { "ai-video": 0, "ai-voice": 4 };
    const out = html(4);
    expect(makeButton(out)).not.toContain('disabled=""');
    expect(out).not.toContain(NO_VIDEOS);
  });

  it("is off with its reason when a saved presenter would make the video now", () => {
    fake.left = { "ai-video": 0, "ai-voice": 4 };
    fake.who = "presenter";
    const out = html(4);
    expect(makeButton(out)).toContain('disabled=""');
    expect(out).toContain(NO_VIDEOS);
  });

  it("is on with a saved presenter while videos are left", () => {
    fake.left = { "ai-video": 2, "ai-voice": 4 };
    fake.who = "presenter";
    expect(makeButton(html(4))).not.toContain('disabled=""');
  });
});

describe("the side column on a script post (live-p5w4 N5: the caption repeated the script with its HOOK:, BODY: and CTA: labels)", () => {
  const once = (out: string, text: string) => out.split(text).length - 1;

  it("shows a short video's script once, in its labelled blocks, with no caption repeating it", () => {
    const out = html(3);
    expect(out).not.toContain("HOOK:");
    expect(out).not.toContain("Caption | ");
    expect(once(out, "Then the record may not show the work you just did.")).toBe(1);
  });

  it("shows an AI video's script once", () => {
    const out = html(4);
    expect(out).not.toContain("Caption | ");
    expect(once(out, "Now, they can sit together in one app.")).toBe(1);
  });

  it("keeps a text post's caption", () => {
    expect(html(1)).toContain("Caption | LinkedIn");
  });
});
