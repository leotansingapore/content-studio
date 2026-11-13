// Studio > Overview (/studio), in Fastlane's order (13 Nov): the question and its box, the jump chips, Make your own,
// Content formats, Static ads, Your latest, Remix a competitor ad, then trending. And Write it, which opens the writer
// on its last step.
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
/** One section's markup, from its opening tag to its close. */
const section = (out: string, id: string) => {
  const at = out.indexOf(`<section id="${id}"`);
  return at < 0 ? "" : out.slice(at, out.indexOf("</section>", at));
};
const jumps = (out: string) => hrefs(out.slice(out.indexOf('aria-label="Jump to"'), out.indexOf("</nav>")));
const LEO = { id: "40f07a18-0000-4000-8000-000000000001", email: "tanjunsing@gmail.com" };
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
  it("asks what to make, the writer box under it with Write it its one filled button, and lists every other maker as a format", () => {
    const out = html();
    expect(out).toContain("What do you want to make?");
    expect(out).toContain('id="topic"');
    expect(out).toMatch(/<button[^>]*class="[^"]*\bbg-primary text-primary-foreground[^"]*"[^>]*>Write it/);
    // the formats are the chips' makers, so the box shows no chips
    expect(out).not.toContain(">Weekly batch</button>");
    const formats = section(out, "formats");
    expect(formats).toMatch(/Content formats<span[^>]*>11<\/span>/);
    expect(hrefs(formats)).toEqual(CUSTOMER_FORMATS.map((w) => w.to));
    expect(hrefs(formats)).not.toContain("/generate");
    // Leo's catalogue, Make your own and static ads stay his
    for (const gone of ['id="own"', 'id="static-ads"', "Message to the agent"]) expect(out).not.toContain(gone);
  });

  it("jumps to the formats and their latest, with the formats' count", () => {
    const out = html();
    expect(jumps(out).slice(0, 2)).toEqual(["/studio#formats", "/studio#latest"]);
    expect(out).toMatch(/Formats<span[^>]*>11<\/span>/);
    expect(section(out, "latest")).toContain("Your latest");
  });
});

describe("Create's type tabs", () => {
  // the formats' own chips: the trending switch further down has pressed chips of its own
  const pressed = (out: string) => [...section(out, "formats").matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]+)/g)].map((m) => m[1]);
  const formatHrefs = (out: string) => hrefs(section(out, "formats"));

  it("opens on All, one chip per kind in the Create picker's order", () => {
    const out = html();
    const row = out.slice(out.indexOf('aria-label="Kind of format"'), out.indexOf('aria-label="Ways to make"'));
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
    const formats = section(html(), "formats");
    const cards = formats.slice(formats.indexOf('aria-label="Ways to make"')).split("<li").slice(1);
    expect(cards).toHaveLength(CUSTOMER_FORMATS.length);
    cards.forEach((card, i) => {
      const w = CUSTOMER_FORMATS[i];
      const picture = Math.max(card.indexOf("<img"), card.indexOf("<svg"));
      const kind = card.indexOf(`>${kindOf(w.to)}<`);
      // a card's name can be its kind ("Video"): look for the name after the kind
      const name = card.indexOf(`>${w.name}<`, kind + 1);
      const at = [picture, kind, name, card.indexOf(`>${w.blurb}<`, name + 1)];
      expect(at.every((n) => n >= 0), w.to).toBe(true);
      expect(at[0] < at[1] && at[1] < at[2] && at[2] < at[3], w.to).toBe(true);
    });
  });

  it("Leo's catalogue gets the same chips, only for the kinds it holds", () => {
    as.user = LEO;
    const out = html("/studio?kind=words");
    expect(pressed(out)).toEqual(["Words"]);
    expect(formatHrefs(out).length).toBeGreaterThan(1);
    expect(formatHrefs(out).length).toBeLessThan(formatHrefs(html()).length);
  });
});

describe("Studio overview for Leo", () => {
  it("asks what the agent should make over its box, then jumps to every section in Fastlane's order", () => {
    as.user = LEO;
    const out = html();
    expect(out).toContain('<h1 class="sr-only">Studio</h1>');
    expect(out).toContain("Tell the agent, or pick a format, an ad or a trending post below.");
    // the composer is its own chunk: its frame holds the place while it loads
    expect(out).toMatch(/aria-busy="true"/);
    expect(jumps(out).slice(0, 3)).toEqual(["/studio#formats", "/studio#static-ads", "/studio#latest"]);
    const order = ["own", "formats", "static-ads", "latest"].map((id) => out.indexOf(`<section id="${id}"`));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("Make your own is Fastlane's three cards, each priced", () => {
    as.user = LEO;
    const own = section(html(), "own");
    expect(hrefs(own)).toEqual(["/edit", "/image", "/edit?panel=ai&kind=template"]);
    for (const name of ["Upload your own", "Generate images", "Generate a video"]) expect(own).toContain(name);
    expect((own.match(/rounded-full border border-border px-2/g) ?? []).length).toBe(3);
  });

  it("the catalogue holds the video formats, the static ads their own section, each opening its page", () => {
    as.user = LEO;
    const out = html();
    const formats = section(out, "formats");
    expect(formats).toContain('href="/make"');
    expect(hrefs(formats).some((h) => h.startsWith("/make/static/"))).toBe(false);
    const statics = hrefs(section(out, "static-ads")).filter((h) => h.startsWith("/make/static/"));
    expect(statics.length).toBeGreaterThanOrEqual(22);
    expect(out).not.toContain('id="topic"');
  });
});
