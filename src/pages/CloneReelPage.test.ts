// /clone's result card ("Your version") for any session that is not Leo's: it must draw exactly as it did before
// "Rebuild this edit" (pinned on today's code at b248a057). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedClone } from "@/lib/reelClone";

const as = vi.hoisted(() => ({ leo: false }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoOnly: () => as.leo, useLeoUser: () => (as.leo ? { id: "u1", email: "leo@example.com" } : null) }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { VersionCard } = await import("./CloneReelPage");

const clone = (platform: "instagram" | "tiktok" = "instagram", isVideo = true): SavedClone => ({
  id: `${platform}:C8xYz12AbCd`,
  savedAt: "2026-10-20T02:00:00.000Z",
  result: {
    source: {
      platform,
      postId: "C8xYz12AbCd",
      url: platform === "instagram" ? "https://www.instagram.com/reel/C8xYz12AbCd/" : "https://www.tiktok.com/@sgmoney/video/C8xYz12AbCd",
      author: "sgmoney",
      caption: "Three CPF moves before 55",
      transcript: "Most people check their CPF once a year. Here are three moves to make before 55.",
      isVideo,
      postedAt: "2026-10-01T00:00:00.000Z",
      durationSec: 38,
      metrics: null,
      metricsAsOf: null,
    },
    breakdown: { hook: "A surprising habit", beats: ["The habit", "Three moves", "The ask"], payoff: "A plan", cta: "Follow for more", whyItWorked: "It names a worry." },
    myVersion: {
      hook: "Most advisers check CPF once a year",
      script: "Most advisers check CPF once a year.\nHere is what I check instead.\nMessage me for yours.",
      caption: "Three CPF checks.",
      cta: "Message me",
      filmingNotes: "",
    },
    cached: false,
    usage: null,
  },
});

const html = (c: SavedClone) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/clone?clone=instagram%3AC8xYz12AbCd"] },
      createElement(VersionCard, {
        clone: c,
        building: null,
        conceptError: null,
        onOpenInWrite: () => {},
        onMakeVideo: () => {},
        onAddToBoard: () => {},
        onChooseHook: () => {},
        onChooseConcept: () => {},
      }),
    ),
  );

afterEach(() => {
  as.leo = false;
});

describe("/clone's result card for everyone else", () => {
  it("draws today's card", async () => {
    await expect(html(clone())).toMatchFileSnapshot("./__pins__/clone-result-everyone.html");
  });
});
