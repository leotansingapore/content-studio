// Studio > Overview (/studio), after Fastlane's (11 Nov): a way to start at the top, every format as a card under
// Content formats, then Remix a competitor ad. And Write it, which opens the writer on its last step.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined) } } }));

import StudioPage, { CUSTOMER_FORMATS, writeTarget } from "./StudioPage";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/studio"] }, createElement(StudioPage))).replace(/&amp;/g, "&");
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
