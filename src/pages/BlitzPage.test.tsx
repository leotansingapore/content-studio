// /blitz while the deck is being made: the status is said once, beside the heading, over a quiet skeleton (13 Nov:
// "Making today's 9, 0 ready" showed twice).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { BlitzCard } from "@/lib/blitz";

const deck = vi.hoisted(() => ({ cards: [] as BlitzCard[], running: true }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getUser: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => ({ id: "u-blitz", email: "leo@example.com" }) }));
vi.mock("@/lib/blitz", async (actual) => ({ ...(await actual<typeof import("@/lib/blitz")>()), loadBlitz: () => ({ day: "2026-11-13", mix: {}, cards: deck.cards }) }));
vi.mock("@/lib/blitzJob", async (actual) => ({ ...(await actual<typeof import("@/lib/blitzJob")>()), blitzBusy: () => deck.running, nothingToDraw: () => false, startDeck: () => "busy" }));

const { default: BlitzPage } = await import("./BlitzPage");
const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/blitz"] }, createElement(BlitzPage)));
const making = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, format: "slideshow", source: null, why: "", state: "making" }) as BlitzCard);

describe("Blitz while making today's deck", () => {
  it("says how far it is once, beside the heading", () => {
    deck.cards = making(9);
    const out = html();
    expect(out.split("Making today&#x27;s 9, 0 ready").length - 1).toBe(1);
    expect(out).toContain('aria-busy="true"');
  });

  it("says it is making the deck once before the first card is planned", () => {
    deck.cards = [];
    expect(html().split("Making today&#x27;s deck").length - 1).toBe(1);
  });
});

describe("a card that couldn't be made", () => {
  const failed = (error: string) => ({ id: "f1", format: "wall", source: null, topic: { title: "T", angle: "" }, why: "", state: "failed", error }) as BlitzCard;

  it("counts only made cards as ready", () => {
    deck.cards = [failed("Couldn't make this one."), ...making(2)];
    expect(html()).toContain("Making today&#x27;s 3, 0 ready");
  });

  it("offers Try again only when another try can work", async () => {
    const { DEAD_LINE, FAILED_LINE } = await import("@/lib/blitz");
    deck.running = false;
    deck.cards = [failed(FAILED_LINE)];
    expect(html()).toContain("Try again");
    deck.cards = [failed(DEAD_LINE)];
    expect(html()).not.toContain("Try again");
    deck.running = true;
  });
});
