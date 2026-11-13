// Studio > Overview (/studio), after Fastlane's (11 Nov): a way to start at the top, every format as a card under
// Content formats, then Remix a competitor ad. And Write it, which opens the writer on its last step.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kindOf } from "@/lib/createFormats";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined) } } }));

import StudioPage, { CUSTOMER_FORMATS, writeTarget } from "./StudioPage";

const html = (at = "/studio") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(StudioPage))).replace(/&amp;/g, "&");
const hrefs = (out: string) => [...out.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
afterEach(() => {
  as.user = null;
});

describe("writeTarget", () => {
  it("opens the writer on its last step with the topic typed", () => {
    expect(writeTarget("  CPF myths ")).toBe("/generate?detail=CPF+myths");
  });
  it("asks for the topic first when the box is empty, rather than opening the writer on step one", () => {
    expect(writeTarget("")).toBeNull();
    expect(writeTarget("   ")).toBeNull();
  });
});

describe("Studio overview for everyone else", () => {
  it("starts with the writer box, Write it its one filled button, and lists every other maker as a format", () => {
    const out = html();
    expect(out).toContain('id="topic"');
    expect(out).toMatch(/<button[^>]*class="[^"]*\bbg-primary text-primary-foreground[^"]*"[^>]*>Write it/);
    // the formats are the chips' makers, so the box shows no chips
    expect(out).not.toContain(">Weekly batch</button>");
    expect(out).toMatch(/Content formats<span[^>]*>11<\/span>/);
    expect(hrefs(out).slice(0, CUSTOMER_FORMATS.length)).toEqual(CUSTOMER_FORMATS.map((w) => w.to));
    expect(hrefs(out)).not.toContain("/generate");
    // trending posts live under Find posts and your latest under Library
    for (const gone of ["Trending", "Your latest", "Ads running now"]) expect(out).not.toContain(gone);
  });
});

describe("Create's type tabs", () => {
  const pressed = (out: string) => [...out.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]+)/g)].map((m) => m[1]);
  const formatHrefs = (out: string) => hrefs(out.slice(out.indexOf("<ul"), out.indexOf("</ul>")));

  it("opens on All, one chip per kind in the Create picker's order", () => {
    const out = html();
    const row = out.slice(out.indexOf('aria-label="Kind of format"'), out.indexOf("<ul"));
    expect([...row.matchAll(/<button[^>]*>([^<]+)/g)].map((m) => m[1])).toEqual(["All", "Words", "Slides and pictures", "Video"]);
    expect(pressed(out)).toEqual(["All"]);
  });

  it("?kind= keeps only that kind's makers, in the same order", () => {
    for (const [param, kind] of [["words", "Words"], ["slides-and-pictures", "Slides and pictures"], ["video", "Video"]]) {
      const out = html(`/studio?kind=${param}`);
      expect(pressed(out), param).toEqual([kind]);
      const want = CUSTOMER_FORMATS.filter((w) => kindOf(w.to) === kind).map((w) => w.to);
      expect(want.length, param).toBeGreaterThan(0);
      expect(formatHrefs(out), param).toEqual(want);
      // the heading counts the cards shown, not every format
      expect(out, param).toMatch(new RegExp(`Content formats<span[^>]*>${want.length}</span>`));
    }
  });

  it("a kind the address made up reads as All", () => {
    const out = html("/studio?kind=podcasts");
    expect(pressed(out)).toEqual(["All"]);
    expect(formatHrefs(out)).toHaveLength(CUSTOMER_FORMATS.length);
  });

  it("every card shows its picture, its kind, its name and one line, in that order", () => {
    const out = html();
    const cards = out.slice(out.indexOf("<ul"), out.indexOf("</ul>")).split("<li").slice(1);
    expect(cards).toHaveLength(CUSTOMER_FORMATS.length);
    cards.forEach((card, i) => {
      const w = CUSTOMER_FORMATS[i];
      const at = [card.indexOf("<svg"), card.indexOf(`>${kindOf(w.to)}<`), card.indexOf(`>${w.name}<`), card.indexOf(`>${w.blurb}<`)];
      expect(at.every((n) => n >= 0), w.to).toBe(true);
      expect([...at].sort((a, b) => a - b), w.to).toEqual(at);
    });
  });

  it("Leo's catalogue gets the same chips, only for the kinds it holds", () => {
    as.user = { id: "40f07a18-0000-4000-8000-000000000001", email: "tanjunsing@gmail.com" };
    const out = html("/studio?kind=words");
    expect(pressed(out)).toEqual(["Words"]);
    expect(formatHrefs(out).length).toBeGreaterThan(0);
    expect(formatHrefs(out).length).toBeLessThan(formatHrefs(html()).length);
  });
});

describe("Studio overview for Leo", () => {
  it("opens on Fastlane's three cards and the priced catalogue, with no composer (it is on Home)", () => {
    as.user = { id: "40f07a18-0000-4000-8000-000000000001", email: "tanjunsing@gmail.com" };
    const out = html();
    expect(out).toContain('<h1 class="sr-only">Studio</h1>');
    expect(hrefs(out).slice(0, 3)).toEqual(["/edit", "/image", "/edit?panel=ai&kind=template"]);
    expect(out).toContain("Upload your own");
    expect(out).toContain('href="/make"');
    expect(out).not.toContain('id="topic"');
    expect(out).not.toContain("Message to the agent");
  });
});
